import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
const calls = globalThis.__projectWorkspaceTest = [];
const result = await build({entryPoints:["lib/projects/workspace.ts"],bundle:true,platform:"node",format:"cjs",write:false,packages:"external",plugins:[{name:"fixture",setup(b){
  b.onResolve({filter:/^(server-only|@\/database\/db)$/},({path})=>({path,namespace:"fixture"}));
  b.onLoad({filter:/.*/,namespace:"fixture"},({path})=>({loader:"js",contents:path==="server-only"?"":"export const db={async execute(q){globalThis.__projectWorkspaceTest.push(q);return {rows:[]}}};"}));
}}]});
const file=resolve("tmp/phase1c-workspace-test.cjs");await writeFile(file,result.outputFiles[0].contents);
const {readProjectWorkspace}=createRequire(import.meta.url)(file);const dialect=new PgDialect();
await readProjectWorkspace("org_fixture","10000000-0000-4000-8000-000000000001",["projects_read"]);
assert.equal(calls.length,6);let queries=calls.map(q=>dialect.sqlToQuery(q));assert(queries.every(q=>q.params.includes("org_fixture")));assert(queries.every(q=>q.params.includes("10000000-0000-4000-8000-000000000001")));assert(!queries.some(q=>/\b(invoices|expenses|quotation_versions)\b/.test(q.sql)));
calls.length=0;await readProjectWorkspace("org_fixture","10000000-0000-4000-8000-000000000001",["projects_read","invoices_read","expenses_read","quotations_read"]);
assert.equal(calls.length,11); // Phase 1D adds expense summary + financial activity, both gated by expenses_read.
queries=calls.map(q=>dialect.sqlToQuery(q));assert(queries.every(q=>q.params.includes("org_fixture")));assert(queries.some(q=>/\binvoices\b/.test(q.sql)));assert(queries.some(q=>/\bexpenses\b/.test(q.sql)));assert(queries.some(q=>/\bquotation_versions\b/.test(q.sql)));
console.log("PASS: project workspace queries are organization/project scoped; finance and quotation queries follow permissions.");
