/* eslint-disable @typescript-eslint/no-require-imports */
const {Client}=require('pg');const {randomUUID}=require('crypto');const readline=require('readline');
readline.createInterface({input:process.stdin,terminal:false}).once('line',async line=>{
 let a,b,setup;try{
 const u=new URL(line);if(u.hostname!=='ep-mute-mode-arqh0aim.c-4.us-west-2.aws.neon.tech'||u.pathname!=='/phase1b_stabilization_fixture')throw Error('Refusing non-fixture target');
 a=new Client({connectionString:line});b=new Client({connectionString:line});setup=new Client({connectionString:line});await Promise.all([a.connect(),b.connect(),setup.connect()]);
 const org='fixture-'+randomUUID(),ids=[randomUUID(),randomUUID(),randomUUID()],email=randomUUID()+'@example.test';
 await setup.query('INSERT INTO organizations(id,name,legal_name) VALUES($1,$2,$2)',[org,'Synthetic fixture']);
 for(const id of ids)await setup.query("INSERT INTO leads(id,organization_id,type,full_name,email,phone,service,status) VALUES($1,$2,'project_request','Fixture Person',$3,'+256700000000','architecture','qualified')",[id,org,email]);
 const data={kind:'individual',displayName:'Fixture Person',legalName:'',tradingName:'',department:'architecture',taxIdentifier:'',billingAddress:{},contacts:[{name:'Fixture Person',email,phone:'+256700000000',isPrimary:true}]};
 const call=(client,id)=>client.query('SELECT lead_convert($1,$2,$3,NULL,$4::jsonb,$5) AS id',[org,'fixture',id,JSON.stringify(data),'fixture']);
 await a.query('BEGIN'); await b.query('BEGIN');
 const first=await call(a,ids[0]);let settled=false; const wait=call(b,ids[0]).then(x=>{settled=true;return x});
 await new Promise(r=>setTimeout(r,500));if(settled)throw Error('Expected same-lead lock was not observed');await a.query('COMMIT');const second=await wait;await b.query('COMMIT');if(first.rows[0].id!==second.rows[0].id)throw Error('Same lead produced different clients');
 const raceName='Distinct overlap '+randomUUID(),raceEmail=randomUUID()+'@example.test';
 await setup.query('UPDATE leads SET full_name=$1,email=$2,phone=$3 WHERE id=ANY($4::uuid[])',[raceName,raceEmail,'+256700000003',[ids[1],ids[2]]]);
 const raceData={...data,displayName:raceName,contacts:[{name:raceName,email:raceEmail,phone:'+256700000003',isPrimary:true}]};
 const raceCall=(client,id)=>client.query('SELECT lead_convert($1,$2,$3,NULL,$4::jsonb,$5) AS id',[org,'fixture',id,JSON.stringify(raceData),'fixture']);
 await a.query('BEGIN');await b.query('BEGIN');const x=await raceCall(a,ids[1]);const y=await raceCall(b,ids[2]);await a.query('COMMIT');await b.query('COMMIT');
 const counts=await setup.query('SELECT count(*)::int n FROM clients WHERE organization_id=$1 AND display_name=$2',[org,raceName]);
 console.log('PASS: two independent connections; same-lead retry blocked until commit and returned one ID.');
 console.log(`RACE RESULT: overlapping different leads created ${counts.rows[0].n} clients; different IDs=${x.rows[0].id!==y.rows[0].id}.`);
 if(counts.rows[0].n!==1)process.exitCode=2;
 }catch(e){console.error('Fixture concurrency test failed:',e.message);process.exitCode=1;}finally{for(const c of [a,b,setup])if(c)try{await c.end()}catch{}process.exit(process.exitCode||0)}
});
