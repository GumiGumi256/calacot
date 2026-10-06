import {config} from "dotenv";
import {neon} from "@neondatabase/serverless";
config({path:[".env.local",".env"],quiet:true});
async function main(){
  const url=process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL;
  if(!url)throw new Error('Application connection missing');
  const client=neon(url);
  const schemas=await client.query("SELECT nspname AS schema FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname");
  console.log('Database schemas:',schemas);
  if(process.argv.includes('--inspect'))return;
  if(process.env.CALACOT_DATABASE_RESET_APPROVED!=='ERASE_AND_REBUILD_PRODUCTION')throw new Error('Explicit database reset approval required');
  if(schemas.some(s=>!['public','drizzle'].includes(String(s.schema))))throw new Error('Unexpected schemas require explicit review; reset stopped');
  await client.transaction([
    client.query("SET LOCAL lock_timeout='10s'"),
    client.query('DROP SCHEMA IF EXISTS drizzle CASCADE'),
    client.query('DROP SCHEMA public CASCADE'),
    client.query('CREATE SCHEMA public'),
    client.query('GRANT USAGE ON SCHEMA public TO PUBLIC'),
  ]);
  console.log('Approved production application schema and migration ledger reset. Ready for drizzle-kit migrate.');
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Reset failed');process.exitCode=1;});
