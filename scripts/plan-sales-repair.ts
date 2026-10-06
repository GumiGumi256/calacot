import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readFile, writeFile } from "node:fs/promises";
config({path:[".env.local",".env"],quiet:true});
type Table = {name:string;schema:string;columns:Record<string,unknown>;uniqueConstraints:Record<string,{name:string;columns:string[];nullsNotDistinct:boolean}>;foreignKeys:Record<string,{name:string;tableTo:string;schemaTo?:string;columnsFrom:string[];columnsTo:string[];onDelete:string;onUpdate:string}>;checkConstraints:Record<string,{name:string;value:string}>};
const ident = (name:string) => '"'+name.replaceAll('"','""')+'"';
const literal = (value:string) => "'"+value.replaceAll("'","''")+"'";

async function main() {
  const target = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!target) throw new Error("Application connection missing");
  const query = neon(target).query;
  const snapshot = JSON.parse(await readFile("drizzle/meta/0009_snapshot.json","utf8")) as {tables:Record<string,Table>};
  const rows = await query("SELECT t.relname AS table_name,c.conname AS name FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'");
  const existing = new Set(rows.map(r=>`${r.table_name}/${r.name}`));
  const columns = await query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'");
  const available = new Set(columns.map(r=>`${r.table_name}/${r.column_name}`));
  const uniques:string[] = [], foreign:string[] = [], checks:string[] = [];
  const report:{table:string;name:string;kind:string}[] = [];
  const blocked:string[] = [];
  const add = (table:Table,name:string,kind:string,definition:string,list:string[]) => {
    name=name.slice(0,63); // Snapshot identifiers here are ASCII; PostgreSQL's catalog limit is 63 bytes.
    if (existing.has(`${table.name}/${name}`)) return;
    const ref = `public.${ident(table.name)}`;
    list.push(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=${literal(ref)}::regclass AND conname=${literal(name)}) THEN ALTER TABLE ${ref} ADD CONSTRAINT ${ident(name)} ${definition}; END IF; END $$;`);
    report.push({table:table.name,name,kind});
  };
  for (const table of Object.values(snapshot.tables)) {
    if (Object.keys(table.columns).some(c=>!available.has(`${table.name}/${c}`))) {blocked.push(table.name);continue;}
    for (const u of Object.values(table.uniqueConstraints)) add(table,u.name,"unique",`UNIQUE ${u.nullsNotDistinct?'NULLS NOT DISTINCT ':''}(${u.columns.map(ident).join(',')})`,uniques);
    for (const f of Object.values(table.foreignKeys)) {
      if (f.columnsTo.some(c=>!available.has(`${f.tableTo}/${c}`))) {blocked.push(`${table.name}/${f.name}`);continue;}
      add(table,f.name,"foreign key",`FOREIGN KEY (${f.columnsFrom.map(ident).join(',')}) REFERENCES ${ident(f.schemaTo||'public')}.${ident(f.tableTo)} (${f.columnsTo.map(ident).join(',')}) ON DELETE ${f.onDelete} ON UPDATE ${f.onUpdate}`,foreign);
    }
    for (const c of Object.values(table.checkConstraints)) add(table,c.name,"check",`CHECK (${c.value})`,checks);
  }
  if (blocked.length) throw new Error(`Baseline column gaps require separate review: ${blocked.join(', ')}`);
  const output = ["-- Catalog-derived repair of missing 0009 baseline constraints only.","-- Review and approve production execution; take a recovery point first.","-- No DROP, CASCADE, row changes or sales issuance. Existing constraints are untouched.","BEGIN;","SET LOCAL lock_timeout='5s';","SET LOCAL statement_timeout='60s';",...uniques,...checks,...foreign,"COMMIT;"].join('\n\n');
  await writeFile("docs/sales-constraint-repair.sql",output+'\n');
  await writeFile("docs/sales-constraint-repair.json",JSON.stringify(report,null,2)+'\n');
  console.log(`Prepared ${report.filter(r=>r.kind==='unique').length} unique, ${report.filter(r=>r.kind==='foreign key').length} foreign-key and ${report.filter(r=>r.kind==='check').length} check restorations.`);
  console.log("Review docs/sales-constraint-repair.sql. No database changes executed.");
}
main().catch(error=>{console.error(error instanceof Error ? error.message : "Repair planning failed");process.exitCode=1;});
