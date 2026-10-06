import {config} from 'dotenv';
import {neon} from '@neondatabase/serverless';
config({path:['.env.local','.env'],quiet:true});
async function main(){
 const sql=neon(process.env.DATABASE_URL!);
 console.log(await sql.query("SELECT EXISTS(SELECT 1 FROM organizations WHERE id=$1) AS organization_present, to_regprocedure('sales_client(text,text,jsonb,text)') IS NOT NULL AS client_function_present",[process.env.CALACOT_CLERK_ORG_ID]));
}
main().catch(e=>{console.error(e.code||'configuration_error');process.exitCode=1;});
