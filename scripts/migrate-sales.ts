import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { splitSql, resumableStatement } from "./sales-migration-plan";

config({ path: [".env.local", ".env"], quiet: true });
/** Use the application's existing database; execution still requires explicit approval. */
async function main() {
  const target = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!target) throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL for the existing application database");
  const checkOnly=process.argv.includes("--check");
  if (!checkOnly && process.env.SALES_MIGRATION_APPROVED !== "true") throw new Error("Set SALES_MIGRATION_APPROVED=true after reviewing the migrations");
  const available = ["0010_sales_workflow.sql", "0011_client_departments.sql"];
  const selected = process.env.SALES_MIGRATION_FILE || "all";
  if (selected !== "all" && !available.includes(selected)) throw new Error("Select a supported SALES_MIGRATION_FILE or all");
  const files = selected === "all" ? available : [selected];
  const client = neon(target);
  const snapshot = JSON.parse(await readFile("drizzle/meta/0011_snapshot.json","utf8"));
  const catalog = await client.query("SELECT t.relname AS table_name,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND t.relkind IN('r','p')");
  const statements: string[] = [];
  for (const file of files) {
    const raw = splitSql(await readFile(`drizzle/${file}`, "utf8"));
    for(const source of raw) {
      const clean=source.replace(/--[^\n]*/g,'').trim();
      const table=/^CREATE TABLE "([^"]+)"/i.exec(clean);
      const column=/^ALTER TABLE "([^"]+)" ADD COLUMN "([^"]+)"/i.exec(clean);
      const name=table?.[1]||column?.[1];
      if(name) {
        const expected=snapshot.tables[`public.${name}`].columns;
        const keys=column?[column[2]]:Object.keys(expected);
        for(const key of keys) {
          const actual=catalog.find(c=>c.table_name===name&&c.column_name===key);
          if(!actual && table && catalog.some(c=>c.table_name===name))throw new Error(`Existing table ${name} lacks ${key}; explicit reconciliation required`);
          if(actual&&(String(actual.type).replaceAll(' ','')!==expected[key].type.replaceAll(' ','')||(expected[key].notNull&&!actual.required)))throw new Error(`Existing column ${name}.${key} differs from the reviewed schema; migration stopped`);
        }
      }
      statements.push(resumableStatement(source));
    }
  }
  if(checkOnly){console.log(`Read-only preflight passed: ${statements.length} resumable statements prepared for ${files.join(', ')}. No changes executed.`);return;}
  await client.transaction([client.query("SET LOCAL lock_timeout='5s'"),...statements.map(statement => client.query(statement))]);
  console.log(`Applied ${files.join(", ")} to explicitly configured target`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Migration failed"); process.exitCode=1; });
