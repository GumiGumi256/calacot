import {config} from 'dotenv';
import {neon} from '@neondatabase/serverless';
config({path:['.env.local','.env'],quiet:true});
async function main(){
 console.log('Email configuration:',{mode:process.env.SALES_NOTIFICATION_MODE||'capture',apiKeyPresent:!!process.env.RESEND_API_KEY,senderPresent:!!process.env.RESEND_FROM_EMAIL,replyToPresent:!!process.env.CALACOT_REPLY_TO_EMAIL,workerSecretPresent:(process.env.SALES_WORKER_SECRET?.length||0)>=32});
 const sql=neon(process.env.DATABASE_URL!);
 console.log('Delivery states:',await sql.query("SELECT channel,status,error_code,count(*)::int AS count FROM delivery_intents WHERE organization_id=$1 GROUP BY channel,status,error_code",[process.env.CALACOT_CLERK_ORG_ID]));
 console.log('Worker queue:',await sql.query("SELECT status,attempts,last_error_code,count(*)::int AS count FROM automation_outbox WHERE organization_id=$1 AND event_type='sales.delivery' GROUP BY status,attempts,last_error_code",[process.env.CALACOT_CLERK_ORG_ID]));
}
main().catch(e=>{console.error(e.code||'configuration_or_connection');process.exitCode=1;});
