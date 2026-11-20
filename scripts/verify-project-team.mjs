import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

const pg = new PGlite();
try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) for (const statement of (await readFile(`drizzle-current/${entry.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (statement.trim()) await pg.exec(statement);
  const project = "00000000-0000-4000-8000-000000000002", staff = "00000000-0000-4000-8000-000000000003";
  await pg.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A'),('b','B','B');
    INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES('00000000-0000-4000-8000-000000000001','a','individual','Client','architecture');
    INSERT INTO projects(id,organization_id,client_id,code,name,division,currency) VALUES('${project}','a','00000000-0000-4000-8000-000000000001','P1','Project','architecture','UGX');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,status) VALUES('${staff}','a','staff','active');`);
  const ctx = globalThis.__teamTest = { db: drizzle(pg), org: "a", allowed: true };
  const bundle = await build({ entryPoints: ["lib/projects/team-actions.ts"], bundle: true, platform: "node", format: "cjs", write: false, packages: "external", plugins: [{ name: "isolate", setup(b) {
    b.onResolve({ filter: /^(next\/cache|@\/database\/db|@\/lib\/sales\/permissions)$/ }, ({ path }) => ({ path, namespace: "test" }));
    b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => {
      if (path === "next/cache") return { loader: "js", contents: "export function revalidatePath(){} export function revalidateTag(){} export function updateTag(){} export function cacheTag(){} export function cacheLife(){}" };
      if (path.includes("permissions")) return { loader: "js", contents: "export async function staffContext(){const c=globalThis.__teamTest;if(!c.allowed)throw Error('unauthorized');return {organizationId:c.org,actor:'actor'}}" };
      return { loader: "js", contents: "export const db={execute(q){return globalThis.__teamTest.db.execute(q)}}" };
    });
  } }] });
  await mkdir("tmp", { recursive: true });
  const file = resolve("tmp/project-team-test.cjs"); await writeFile(file, bundle.outputFiles[0].contents);
  const { addProjectMember, removeProjectMember } = createRequire(import.meta.url)(file);
  const form = values => { const f = new FormData(); for (const [k,v] of Object.entries({ projectId: project, ...values })) f.set(k,v); return f; };
  ctx.allowed = false; await assert.rejects(() => addProjectMember({}, form({kind:"external",name:"Test"})), /unauthorized/); ctx.allowed = true;
  ctx.org = "b"; assert.equal((await addProjectMember({}, form({kind:"external",name:"Test"}))).ok, false); ctx.org = "a";
  assert.equal((await addProjectMember({}, form({kind:"staff",staffId:staff,responsibility:"Manager"}))).ok, true);
  assert.equal((await addProjectMember({}, form({kind:"staff",staffId:staff}))).ok, false);
  assert.equal((await addProjectMember({}, form({kind:"external",name:"Alex Contractor",company:"Builders",email:"alex@example.com"}))).ok, true);
  assert.equal((await addProjectMember({}, form({kind:"external",name:"  "}))).ok, false);
  const rows = (await pg.query("SELECT id,staff_id,external_name FROM project_members ORDER BY external_name NULLS FIRST")).rows;
  assert.equal(rows.length, 2); assert.equal(rows[0].staff_id, staff); assert.equal(rows[1].external_name, "Alex Contractor");
  ctx.org = "b"; assert.equal((await removeProjectMember({}, form({memberId:rows[1].id}))).ok, false); ctx.org = "a";
  assert.equal((await removeProjectMember({}, form({memberId:rows[1].id}))).ok, true);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM audit_logs WHERE action IN ('team.add','team.remove')")).rows[0].n, 3);
  await pg.exec(`UPDATE projects SET archived_at=now() WHERE id='${project}'`);
  assert.equal((await addProjectMember({}, form({kind:"external",name:"Late"}))).ok, false);
  console.log("PASS: project team permissions, organization isolation, staff duplicates, external members, removal and audit.");
} finally { await pg.close(); delete globalThis.__teamTest; }
