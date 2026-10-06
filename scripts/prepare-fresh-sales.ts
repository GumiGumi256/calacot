import {readFile,writeFile} from "node:fs/promises";
import {splitSql} from "./sales-migration-plan";
async function main(){
  const services=splitSql(await readFile('database/sales-functions.sql','utf8'));
  await writeFile('drizzle-current/0001_sales_services.sql',services.join('\n--> statement-breakpoint\n')+'\n');
  console.log('Prepared custom workflow migration; no database writes.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
