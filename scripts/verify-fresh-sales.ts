import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import assert from "node:assert/strict";
async function main(){
  const pg=new PGlite();
  const journal=JSON.parse(await readFile('drizzle-current/meta/_journal.json','utf8'));
  for(const entry of journal.entries)for(const statement of (await readFile(`drizzle-current/${entry.tag}.sql`,'utf8')).split('--> statement-breakpoint'))if(statement.trim())await pg.exec(statement);
  const tables=(await pg.query<{count:number}>("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].count;
  assert.equal(tables,54);
  const triggers=(await pg.query<{count:number}>("SELECT count(*)::int AS count FROM pg_trigger WHERE tgname LIKE 'sales_%' AND NOT tgisinternal")).rows[0].count;
  assert.equal(triggers,9);
  const services=(await pg.query<{count:number}>("SELECT count(*)::int AS count FROM pg_proc WHERE proname IN ('sales_client','sales_quote_command','sales_claim')")).rows[0].count;
  assert.equal(services,3);
  console.log('PASS: fresh Drizzle baseline builds 54 tables and installs all 9 sales triggers and core workflow functions.');
  await pg.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
