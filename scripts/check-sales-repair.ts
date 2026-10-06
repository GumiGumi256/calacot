import {config} from "dotenv";
import {neon} from "@neondatabase/serverless";
import {readFile} from "node:fs/promises";
config({path:[".env.local",".env"],quiet:true});
async function main(){
const rows=await neon((process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL)!).query("SELECT t.relname AS table_name,c.conname AS name,c.contype AS type,c.convalidated AS valid,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'");
const report=JSON.parse(await readFile("docs/sales-constraint-repair.json","utf8")) as {table:string;name:string;kind:string}[];
const matches=(c:typeof rows[number],r:typeof report[number])=>c.table_name===r.table&&c.name===r.name.slice(0,63);
for(const r of report){const c=rows.find(c=>matches(c,r));if(!c?.valid)throw new Error(`Missing/unvalidated constraint: ${r.table}/${r.name}`);}
console.log("Verified present and validated constraints:",report.length,"of",report.length);
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Verification failed");process.exitCode=1;});
