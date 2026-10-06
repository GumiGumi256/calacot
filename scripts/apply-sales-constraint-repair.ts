import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
config({path:[".env.local",".env"],quiet:true});

async function main() {
  const target = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!target) throw new Error("Application database connection missing");
  if (process.env.SALES_CONSTRAINT_REPAIR_APPROVED !== "true") throw new Error("Explicit production constraint repair approval required");
  const source = await readFile("docs/sales-constraint-repair.sql","utf8");
  if (/(?:^|;)\s*(DROP|DELETE|UPDATE|INSERT|TRUNCATE)\b/im.test(source.replace(/^--.*$/gm,""))) throw new Error("Repair contains an unexpected destructive or data-changing statement");
  const report = JSON.parse(await readFile("docs/sales-constraint-repair.json","utf8")) as {table:string;name:string;kind:string}[];
  // Preserve each complete DO block; Neon wraps all statements in one transaction.
  // PostgreSQL truncates these ASCII identifiers at 63 bytes, including catalog names.
  const blocks = (source.match(/DO \$\$[\s\S]*?END \$\$;/g) || []).map(block=>block.replace(/conname='([^']+)'/g,(_,name:string)=>`conname='${name.slice(0,63)}'`));
  if (blocks.length !== report.length || !blocks.length) throw new Error("Repair inventory mismatch");
  const client = neon(target);
  await client.transaction([
    client.query("SET LOCAL lock_timeout='5s'"),
    client.query("SET LOCAL statement_timeout='60s'"),
    ...blocks.map(block=>client.query(block)),
  ]);
  const constraints = await client.query("SELECT t.relname AS table_name,c.conname AS name,c.convalidated AS valid FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'");
  const missing = report.filter(r=>!constraints.some(c=>c.table_name===r.table && c.name===r.name.slice(0,63) && c.valid));
  if (missing.length) throw new Error(`Post-repair verification failed for ${missing.length} constraints`);
  console.log(`Production repair committed. Verified ${report.length} restored constraints. No rows deleted or changed.`);
}
main().catch(error=>{
  console.error("Constraint repair failed:",error instanceof Error ? error.message : "database error");
  process.exitCode=1;
});
