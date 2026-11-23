import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import assert from "node:assert/strict";
async function main(){
  const pg=new PGlite();
  const journal=JSON.parse(await readFile('drizzle-current/meta/_journal.json','utf8'));
  // The sales-era schema (baseline through 0008_project_execution) has exactly 55 tables; later
  // migrations add finance, staff, document and accounting tables, so count at that point, then
  // require the rest of the active chain to apply on top.
  const countTables=async()=>(await pg.query<{count:number}>("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].count;
  const salesTriggers=async()=>(await pg.query<{tgname:string}>("SELECT tgname FROM pg_trigger WHERE tgname LIKE 'sales_%' AND NOT tgisinternal ORDER BY tgname")).rows.map((r)=>r.tgname);
  let salesEraTables=-1;let salesEraTriggers:string[]=[];
  for(const entry of journal.entries){
    for(const statement of (await readFile(`drizzle-current/${entry.tag}.sql`,'utf8')).split('--> statement-breakpoint'))if(statement.trim())await pg.exec(statement);
    if(entry.tag==='0008_project_execution'){salesEraTables=await countTables();salesEraTriggers=await salesTriggers();}
  }
  assert.equal(salesEraTables,55);
  assert.ok(await countTables()>55,'later migrations apply on top of the sales-era schema');
  // The 9 sales triggers of the sales-era schema; later migrations may add more, but never drop these.
  assert.equal(salesEraTriggers.length,9);
  const finalTriggers=await salesTriggers();
  for(const t of salesEraTriggers)assert.ok(finalTriggers.includes(t),`sales trigger ${t} survives the full chain`);
  const services=(await pg.query<{count:number}>("SELECT count(*)::int AS count FROM pg_proc WHERE proname IN ('sales_client','sales_quote_command','sales_claim')")).rows[0].count;
  assert.equal(services,3);
  console.log('PASS: fresh Drizzle baseline builds 55 tables and installs all 9 sales triggers and core workflow functions.');
  await pg.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
