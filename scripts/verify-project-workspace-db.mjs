import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
const pg=new PGlite();
try {
 const journal=JSON.parse(await readFile("drizzle-current/meta/_journal.json","utf8"));
 for(const entry of journal.entries)for(const statement of (await readFile(`drizzle-current/${entry.tag}.sql`,"utf8")).split("--> statement-breakpoint"))if(statement.trim())await pg.exec(statement);
 await pg.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A'),('b','B','B');
 INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES('00000000-0000-4000-8000-000000000001','a','individual','Client','architecture');
 INSERT INTO projects(id,organization_id,client_id,code,name,division,currency) VALUES('00000000-0000-4000-8000-000000000002','a','00000000-0000-4000-8000-000000000001','P1','Project','architecture','UGX');
 INSERT INTO staff_memberships(id,organization_id,clerk_user_id,status) VALUES('00000000-0000-4000-8000-000000000003','a','staff','active');
 INSERT INTO project_members(organization_id,project_id,staff_id,responsibility) VALUES('a','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','Lead');
 INSERT INTO tasks(organization_id,project_id,title,status,completed_at) VALUES('a','00000000-0000-4000-8000-000000000002','Completed task','completed',now()),('a','00000000-0000-4000-8000-000000000002','Pending task','todo',null);
 INSERT INTO project_milestones(organization_id,project_id,title,position) VALUES('a','00000000-0000-4000-8000-000000000002','Milestone',0);
 INSERT INTO expenses(organization_id,project_id,division,category,description,net_amount,tax_amount,total,currency,status,incurred_at) VALUES('a','00000000-0000-4000-8000-000000000002','architecture','supplies','Fixture',100,0,100,'UGX','draft',now());
 INSERT INTO invoices(organization_id,client_id,project_id,status,customer_snapshot,issuer_snapshot,currency,total) VALUES('a','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','draft','{}','{}','UGX',0);`);
 globalThis.__projectWorkspaceDb=drizzle(pg);
 const bundle=await build({entryPoints:["lib/projects/workspace.ts"],bundle:true,platform:"node",format:"cjs",write:false,packages:"external",plugins:[{name:"fixture",setup(b){b.onResolve({filter:/^(server-only|next\/cache|@\/database\/db)$/},({path})=>({path,namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},({path})=>({loader:"js",contents:path==="server-only"?"":path==="next/cache"?"export function cacheLife(){} export function cacheTag(){} export function revalidateTag(){} export function updateTag(){} export function revalidatePath(){}":"export const db={execute(q){return globalThis.__projectWorkspaceDb.execute(q)}}"}));}}]});
 const file=resolve("tmp/phase1c-workspace-db.cjs");await writeFile(file,bundle.outputFiles[0].contents);const {readProjectWorkspace}=createRequire(import.meta.url)(file);
 const id="00000000-0000-4000-8000-000000000002";const all=await readProjectWorkspace("a",id,["projects_read","invoices_read","expenses_read","quotations_read"]);
 assert.equal(all.tasks.length,2);assert.deepEqual(all.counts,{total:2,completed:1});assert.equal(all.members.length,1);assert.equal(all.milestones.length,1);assert.equal(all.invoices.length,1);assert.equal(all.expenses.length,1);
 const limited=await readProjectWorkspace("a",id,["projects_read"]);assert.equal(limited.invoices,undefined);assert.equal(limited.expenses,undefined);
 const other=await readProjectWorkspace("b",id,["projects_read","invoices_read","expenses_read"]);assert.equal(other.tasks.length,0);assert.equal(other.invoices.length,0);assert.equal(other.expenses.length,0);
 console.log("PASS: project workspace SQL executes against disposable migrated schema and isolates financial data by permission and organization.");
}finally{await pg.close();delete globalThis.__projectWorkspaceDb}
