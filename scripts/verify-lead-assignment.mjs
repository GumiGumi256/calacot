import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const ctx = globalThis.__leadAssignmentTest = { authorized:true, staff:true, clerk:'member', calls:0 };
const adapters = /^(next\/cache|@\/database\/db|@\/lib\/sales\/permissions|@clerk\/nextjs\/server)$/;
const bundle = await build({entryPoints:['lib/admin/actions.ts'],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:adapters},({path})=>({path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>{
 const prefix='const c=globalThis.__leadAssignmentTest;';
 if(path==='next/cache')return {contents:'export function revalidatePath(){}',loader:'js'};
 if(path.includes('permissions'))return {contents:prefix+'export async function staffContext(){if(!c.authorized)throw Error("unauthorized");return {organizationId:"org_a",actor:"staff",permissions:["leads_write"]}}',loader:'js'};
 if(path==='@clerk/nextjs/server')return {contents:prefix+'export async function clerkClient(){return {organizations:{async getOrganizationMembershipList(){if(c.clerk==="error")throw Error("unavailable");return {data:c.clerk==="member"?[{organization:{id:"org_a"},publicUserData:{userId:"user_1"}}]:[]}}}}}',loader:'js'};
 return {contents:prefix+'export const db={async execute(){c.calls++;return {rows:c.calls%2===1?(c.staff?[{clerk_user_id:"user_1"}]:[]):[{}]}}}',loader:'js'};
 });
}}]});
const file=resolve('tmp/phase1b-assignment-actions.cjs');await writeFile(file,bundle.outputFiles[0].contents);const {updateLead}=createRequire(import.meta.url)(file);
const form=()=>{const f=new FormData();for(const [k,v] of Object.entries({id:'10000000-0000-4000-8000-000000000001',status:'qualified',adminNotes:'',division:'',assignedStaffId:'00000000-0000-4000-8000-000000000001',followUpOn:'',followUpNotes:''}))f.set(k,v);return f};
ctx.authorized=false;await assert.rejects(()=>updateLead({},form()),/unauthorized/);ctx.authorized=true;
for(const scenario of [{staff:false,clerk:'member'},{staff:true,clerk:'missing'},{staff:true,clerk:'error'}]){Object.assign(ctx,scenario,{calls:0});assert.equal((await updateLead({},form())).ok,false);assert.equal(ctx.calls,1);}
Object.assign(ctx,{staff:true,clerk:'member',calls:0});assert.equal((await updateLead({},form())).ok,true);assert.equal(ctx.calls,2);
console.log('PASS: unauthorized actor, missing mirror, removed Clerk membership and Clerk outage fail before assignment; current membership proceeds.');
