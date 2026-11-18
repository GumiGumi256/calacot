import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
let input='';for await(const chunk of process.stdin)input+=chunk;const url=new URL(input.trim());
if(url.hostname!=='ep-mute-mode-arqh0aim.c-4.us-west-2.aws.neon.tech'||url.pathname!=='/phase1b_stabilization_fixture')throw Error('Refusing non-fixture database');
const a=new Client({connectionString:url.toString()}),b=new Client({connectionString:url.toString()});await a.connect();await b.connect();
try {
 const exists=await a.query("SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='mandatory'");
 if(!exists.rowCount){await a.query('BEGIN');try{for(const s of (await readFile('drizzle-current/0008_project_execution.sql','utf8')).split('--> statement-breakpoint'))if(s.trim())await a.query(s);await a.query('COMMIT');}catch(e){await a.query('ROLLBACK');throw e;}}
 const org='phase1c-'+randomUUID(),client=randomUUID(),p1=randomUUID(),p2=randomUUID();
 await a.query('INSERT INTO organizations(id,name,legal_name) VALUES($1,$2,$2)',[org,'Fixture']);
 await a.query("INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES($1,$2,'individual','Fixture','architecture')",[client,org]);
 await a.query("INSERT INTO projects(id,organization_id,client_id,code,name,division,currency) VALUES($1::uuid,$3,$4,$1::text,'Fixture','architecture','UGX'),($2::uuid,$3,$4,$2::text,'Fixture','architecture','UGX')",[p1,p2,org,client]);
 await a.query('BEGIN');await b.query('BEGIN');
 await a.query("INSERT INTO tasks(id,organization_id,project_id,title,mandatory) VALUES($1,$2,$3,'required',true)",[randomUUID(),org,p1]);
 let settled=false;const close=b.query("SELECT project_execution_transition($1,'fixture',$2,'cancelled','','fixture')",[org,p1]).then(()=>{settled=true;return null},e=>{settled=true;return e});
 await new Promise(r=>setTimeout(r,500));assert.equal(settled,false,'closure should wait for in-flight task');await a.query('COMMIT');const failure=await close;assert.match(String(failure),/project_exception_required/);await b.query('ROLLBACK');
 await a.query('BEGIN');await b.query('BEGIN');await a.query("SELECT project_execution_transition($1,'fixture',$2,'cancelled','','fixture')",[org,p2]);
 settled=false;const insert=b.query("INSERT INTO tasks(id,organization_id,project_id,title,mandatory) VALUES($1,$2,$3,'late',true)",[randomUUID(),org,p2]).then(()=>{settled=true;return null},e=>{settled=true;return e});await new Promise(r=>setTimeout(r,500));assert.equal(settled,false,'task should wait for in-flight closure');await a.query('COMMIT');const late=await insert;assert.match(String(late),/project_not_open/);await b.query('ROLLBACK');
 console.log('PASS: migration 0008 on isolated PostgreSQL; independent overlapping task/closure transactions serialize in both orders.');
}finally{await a.end();await b.end()}

