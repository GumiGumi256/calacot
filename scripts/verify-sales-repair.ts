import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
async function main() {
  const pg = new PGlite();
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));
  for (const entry of journal.entries.filter((e:{idx:number})=>e.idx<=9 && ![5,6,7].includes(e.idx))) {
    for (const statement of (await readFile(`drizzle/${entry.tag}.sql`,"utf8")).split("--> statement-breakpoint")) if(statement.trim()) await pg.exec(statement);
  }
  const report = JSON.parse(await readFile("docs/sales-constraint-repair.json","utf8")) as {table:string;name:string;kind:string}[];
  const ident = (s:string)=>'"'+s.replaceAll('"','""')+'"';
  // Reproduce the catalog gaps locally, removing children before referenced keys.
  for (const kind of ["foreign key","check","unique"]) {
    for (const r of report.filter(r=>r.kind===kind)) await pg.exec(`ALTER TABLE public.${ident(r.table)} DROP CONSTRAINT ${ident(r.name)}`);
  }
  const repair = await readFile("docs/sales-constraint-repair.sql","utf8");
  await pg.exec(repair);
  await pg.exec(repair); // Reviewed script is safe to repeat: existing constraints are retained.
  for (const r of report) {
    const result = await pg.query<{valid:boolean}>("SELECT c.convalidated AS valid FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname=$1 AND c.conname=$2",[r.table,r.name]);
    assert.equal(result.rows[0]?.valid,true,`${r.table}/${r.name}`);
  }
  await assert.rejects(pg.query("INSERT INTO staff_memberships(organization_id,clerk_user_id) VALUES('missing_parent','test')"));
  console.log(`PASS: ${report.length} missing constraints restored and validated, repeat execution preserves them, and invalid organization references are rejected.`);
  await pg.close();
}
main().catch(error=>{console.error(error);process.exitCode=1;});
