import {config} from "dotenv";
import {neon} from "@neondatabase/serverless";
import assert from "node:assert/strict";
config({path:[".env.local",".env"],quiet:true});
async function main(){
  const url=process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL;
  if(!url)throw new Error('Missing application connection');
  const sql=neon(url);
  const [result]=await sql.query(`SELECT
    (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,
    (SELECT count(*)::int FROM pg_trigger WHERE tgname LIKE 'sales_%' AND NOT tgisinternal) AS triggers,
    (SELECT count(*)::int FROM pg_proc WHERE proname IN ('sales_client','sales_quote_command','sales_claim')) AS services,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations`);
  assert.equal(result.tables,54);
  assert.equal(result.triggers,9);
  assert.equal(result.services,3);
  assert.equal(result.migrations,2);
  console.log('PASS: rebuilt database catalog and Drizzle ledger:',result);
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Verification failed');process.exitCode=1;});
