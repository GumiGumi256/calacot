import {PGlite} from "@electric-sql/pglite";
import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {splitSql,resumableStatement} from "./sales-migration-plan";
async function main(){
  const pg=new PGlite();
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  for(const entry of journal.entries.filter((e:{idx:number})=>e.idx<=9&&![5,6,7].includes(e.idx)))for(const s of (await readFile(`drizzle/${entry.tag}.sql`,'utf8')).split('--> statement-breakpoint'))if(s.trim())await pg.exec(s);
  const sources=splitSql(await readFile('drizzle/0010_sales_workflow.sql','utf8')).concat(splitSql(await readFile('drizzle/0011_client_departments.sql','utf8')));
  const existing=sources.find(s=>s.includes('CREATE TABLE "delivery_attempts"'))!;
  await pg.exec(existing);
  await pg.exec('ALTER TABLE client_contacts ADD COLUMN whatsapp_consent_at timestamp with time zone;');
  const statements=sources.map(resumableStatement);
  await pg.exec('BEGIN;'+statements.join('\n')+'COMMIT;');
  await pg.exec('BEGIN;'+statements.join('\n')+'COMMIT;');
  const functions=await pg.query<{count:number}>("SELECT count(*)::int AS count FROM pg_proc WHERE proname IN ('sales_client','sales_quote_command','sales_claim')");
  assert.equal(functions.rows[0].count,3);
  const triggers=await pg.query<{count:number}>("SELECT count(*)::int AS count FROM pg_trigger WHERE tgname LIKE 'sales_%' AND NOT tgisinternal");
  assert.equal(triggers.rows[0].count,9);
  const columns=await pg.query<{count:number}>("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='clients' AND column_name IN('trading_name','department')");
  assert.equal(columns.rows[0].count,2);
  console.log('PASS: partially pushed schema reconciles, repeated migration succeeds, functions/triggers and client fields are installed.');
  await pg.close();
}
main().catch(error=>{console.error(error);process.exitCode=1;});
