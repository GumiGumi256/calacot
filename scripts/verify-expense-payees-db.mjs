// Per-person expense breakdown (migration 0026) against a disposable, fully migrated PGlite schema.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

const pg = new PGlite();
const P = "00000000-0000-4000-8000-000000000002", OTHER_P = "00000000-0000-4000-8000-000000000009";
const JOHN = "00000000-0000-4000-8000-0000000000a1", PETER = "00000000-0000-4000-8000-0000000000a2", OUTSIDER = "00000000-0000-4000-8000-0000000000a3";
const fails = async (q, params, code) => {
  await assert.rejects(pg.query(q, params), (e) => { assert.match(String(e.message), new RegExp(code)); return true; });
};
const save = (p) => pg.query("SELECT expense_save_with_payees('a','requester',$1::jsonb,'corr') AS r", [JSON.stringify(p)]).then((r) => r.rows[0].r);
const base = { division: "painting", projectId: P, category: "Labour", description: "Painters week 3", purpose: "Wages for painting crew", currency: "UGX", taxAmount: "", incurredOn: "2026-01-05", supplierInvoiceReference: "" };
try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) for (const s of (await readFile(`drizzle-current/${entry.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A');
    INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES('00000000-0000-4000-8000-000000000001','a','individual','Client','painting');
    INSERT INTO projects(id,organization_id,client_id,code,name,division,currency) VALUES('${P}','a','00000000-0000-4000-8000-000000000001','P1','Repaint','painting','UGX'),('${OTHER_P}','a','00000000-0000-4000-8000-000000000001','P2','Other','painting','UGX');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,status) VALUES('00000000-0000-4000-8000-000000000003','a','requester','active'),('00000000-0000-4000-8000-000000000004','a','approver','active');
    INSERT INTO project_members(id,organization_id,project_id,external_name,responsibility) VALUES('${JOHN}','a','${P}','John','Painter'),('${PETER}','a','${P}','Peter','Painter'),('${OUTSIDER}','a','${OTHER_P}','Sam','Painter');`);

  // Create with a breakdown that adds up to the total.
  const created = await save({ ...base, key: "00000000-0000-4000-8000-000000000101", netAmount: "900000", payees: [{ memberId: JOHN, amount: "400000" }, { memberId: PETER, amount: "500000" }] });
  const eid = created.id;
  assert.equal((await pg.query("SELECT count(*)::int n, sum(amount)::text s FROM expense_payees WHERE expense_id=$1", [eid])).rows[0].s, "900000.00");
  // Replay of the same create key does not duplicate lines.
  await save({ ...base, key: "00000000-0000-4000-8000-000000000101", netAmount: "900000", payees: [{ memberId: JOHN, amount: "900000" }] });
  assert.equal((await pg.query("SELECT count(*)::int n FROM expense_payees WHERE expense_id=$1", [eid])).rows[0].n, 2);

  // Rejected breakdowns roll back the whole save.
  await fails("SELECT expense_save_with_payees('a','requester',$1::jsonb,'c')", [JSON.stringify({ ...base, key: "00000000-0000-4000-8000-000000000102", netAmount: "900000", payees: [{ memberId: JOHN, amount: "100" }] })], "payees_total_mismatch");
  await fails("SELECT expense_save_with_payees('a','requester',$1::jsonb,'c')", [JSON.stringify({ ...base, key: "00000000-0000-4000-8000-000000000103", netAmount: "100", payees: [{ memberId: OUTSIDER, amount: "100" }] })], "payee_not_on_project");
  await fails("SELECT expense_save_with_payees('a','requester',$1::jsonb,'c')", [JSON.stringify({ ...base, key: "00000000-0000-4000-8000-000000000104", netAmount: "200", payees: [{ memberId: JOHN, amount: "100" }, { memberId: JOHN, amount: "100" }] })], "duplicate_payee");
  await fails("SELECT expense_save_with_payees('a','requester',$1::jsonb,'c')", [JSON.stringify({ ...base, key: "00000000-0000-4000-8000-000000000105", netAmount: "100", payees: [{ memberId: JOHN, amount: "-1" }] })], "invalid_payees");
  await fails("SELECT expense_save_with_payees('a','requester',$1::jsonb,'c')", [JSON.stringify({ ...base, projectId: "", key: "00000000-0000-4000-8000-000000000106", netAmount: "100", payees: [{ memberId: JOHN, amount: "100" }] })], "payees_need_project");
  assert.equal((await pg.query("SELECT count(*)::int n FROM expenses")).rows[0].n, 1, "failed saves must not leave expenses behind");

  // Editing replaces the lines and records one history event.
  const updated = await save({ ...base, id: eid, version: 1, key: "00000000-0000-4000-8000-000000000107", netAmount: "1000000", payees: [{ memberId: JOHN, amount: "600000" }, { memberId: PETER, amount: "400000" }] });
  assert.equal(updated.version, 2);
  assert.deepEqual((await pg.query("SELECT project_member_id::text m, amount::text a FROM expense_payees WHERE expense_id=$1 ORDER BY amount DESC", [eid])).rows, [{ m: JOHN, a: "600000.00" }, { m: PETER, a: "400000.00" }]);
  assert.equal((await pg.query("SELECT count(*)::int n FROM expense_events WHERE expense_id=$1 AND action='payees_updated'", [eid])).rows[0].n, 2);

  // Changing the total through the legacy save path leaves a stale breakdown that cannot be submitted.
  await pg.query("SELECT expense_save('a','requester',$1::jsonb,'c')", [JSON.stringify({ ...base, id: eid, version: 2, key: "00000000-0000-4000-8000-000000000108", netAmount: "1000001" })]);
  await fails("SELECT expense_command('a','requester',$1::uuid,'submit',3,'',$2,'c')", [eid, "00000000-0000-4000-8000-000000000109"], "payees_total_mismatch");
  await save({ ...base, id: eid, version: 3, key: "00000000-0000-4000-8000-000000000110", netAmount: "1000000", payees: [{ memberId: JOHN, amount: "600000" }, { memberId: PETER, amount: "400000" }] });

  // Once submitted, lines are locked; a member with lines cannot be removed from the team.
  await pg.query("SELECT expense_command('a','requester',$1::uuid,'submit',4,'',$2,'c')", [eid, "00000000-0000-4000-8000-000000000111"]);
  await fails("DELETE FROM expense_payees WHERE expense_id=$1", [eid], "expense_not_editable");
  await fails("UPDATE expense_payees SET amount=1 WHERE expense_id=$1", [eid], "expense_payees_immutable");
  await fails("DELETE FROM project_members WHERE id=$1", [JOHN], "foreign key|violates");

  // Project workspace: per-person totals by status.
  globalThis.__payeesDb = drizzle(pg);
  const bundle = await build({ entryPoints: ["lib/projects/workspace.ts"], bundle: true, platform: "node", format: "cjs", write: false, packages: "external", plugins: [{ name: "fixture", setup(b) { b.onResolve({ filter: /^(server-only|next\/cache|@\/database\/db)$/ }, ({ path }) => ({ path, namespace: "fixture" })); b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ loader: "js", contents: path === "server-only" ? "" : path === "next/cache" ? "export function cacheLife(){} export function cacheTag(){} export function revalidateTag(){} export function updateTag(){} export function revalidatePath(){}" : "export const db={execute(q){return globalThis.__payeesDb.execute(q)}}" })); } }] });
  await mkdir("tmp", { recursive: true });
  const file = resolve("tmp/expense-payees-workspace.cjs"); await writeFile(file, bundle.outputFiles[0].contents);
  const { readProjectWorkspace } = createRequire(import.meta.url)(file);
  let w = await readProjectWorkspace("a", P, ["projects_read", "expenses_read"]);
  assert.deepEqual(w.teamPayments.map((r) => [r.name, r.pending, r.approved, r.paid]), [["John", "600000.00", "0.00", "0.00"], ["Peter", "400000.00", "0.00", "0.00"]]);
  await pg.query("SELECT expense_command('a','approver',$1::uuid,'approve',5,'',$2,'c')", [eid, "00000000-0000-4000-8000-000000000112"]);
  w = await readProjectWorkspace("a", P, ["projects_read", "expenses_read"]);
  assert.deepEqual(w.teamPayments.map((r) => [r.name, r.approved, r.lines.length]), [["John", "600000.00", 1], ["Peter", "400000.00", 1]]);
  await pg.query("SELECT expense_disburse('a','approver',$1::jsonb,'c')", [JSON.stringify({ expenseId: eid, version: 6, key: "00000000-0000-4000-8000-000000000113", amount: "1000000", currency: "UGX", method: "cash", reference: "", sourceAccountId: "", paidOn: "2026-01-06", responsibleStaffId: "00000000-0000-4000-8000-000000000004", evidenceDocumentId: "", notes: "" })]);
  w = await readProjectWorkspace("a", P, ["projects_read", "expenses_read"]);
  assert.deepEqual(w.teamPayments.map((r) => [r.name, r.paid, r.approved]), [["John", "600000.00", "0.00"], ["Peter", "400000.00", "0.00"]]);
  assert.equal((await readProjectWorkspace("a", P, ["projects_read"])).teamPayments, undefined, "per-person payments need expenses_read");

  console.log("PASS: expense payee breakdown validates totals, team membership and duplicates, locks after submission, and reports per-person totals on the project.");
} finally { await pg.close(); delete globalThis.__payeesDb; }
