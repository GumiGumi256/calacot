// Allocating an approved/paid project expense to team members (migration 0029) against a disposable,
// fully migrated PGlite schema. No environment variables, no network, no real database.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import { drizzle } from "drizzle-orm/pglite";

const pg = new PGlite();
const P = "00000000-0000-4000-8000-000000000002", OTHER_P = "00000000-0000-4000-8000-000000000009";
const ADMIN = "00000000-0000-4000-8000-000000000003";
const JOHN = "00000000-0000-4000-8000-0000000000a1", PETER = "00000000-0000-4000-8000-0000000000a2", OUTSIDER = "00000000-0000-4000-8000-0000000000a3";
let n = 0;
const key = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const fails = async (q, params, code) => {
  await assert.rejects(pg.query(q, params), (e) => { assert.match(String(e.message), new RegExp(code)); return true; });
};
const allocate = (eid, version, payees, k = key()) => pg.query("SELECT expense_allocate_payees('a','admin',$1::uuid,$2,$3::jsonb,'c') AS r", [eid, version, JSON.stringify({ key: k, payees })]).then((r) => r.rows[0].r);
const base = { division: "painting", projectId: P, category: "Site costs", description: "Site costs March", purpose: "Materials and labour for March", currency: "UGX", taxAmount: "", incurredOn: "2026-03-01", supplierInvoiceReference: "", payees: [] };
const cash = { method: "cash", reference: "", sourceAccountId: "", paidOn: "2026-03-02", responsibleStaffId: ADMIN, evidenceDocumentId: "", notes: "" };
try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) for (const s of (await readFile(`drizzle-current/${entry.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A');
    INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES('00000000-0000-4000-8000-000000000001','a','individual','Client','painting');
    INSERT INTO projects(id,organization_id,client_id,code,name,division,currency) VALUES('${P}','a','00000000-0000-4000-8000-000000000001','P1','Repaint','painting','UGX'),('${OTHER_P}','a','00000000-0000-4000-8000-000000000001','P2','Other','painting','UGX');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,status) VALUES('${ADMIN}','a','admin','active');
    INSERT INTO project_members(id,organization_id,project_id,external_name,agreed_amount) VALUES('${JOHN}','a','${P}','John',1000000),('${PETER}','a','${P}','Peter',800000),('${OUTSIDER}','a','${OTHER_P}','Sam',NULL);`);

  // A 2.5M expense recorded and paid earlier, with no per-person split.
  const e = await pg.query("SELECT expense_record_verified('a','admin',$1::jsonb,'c') AS r", [JSON.stringify({ ...base, key: key(), netAmount: "2500000", payment: cash })]).then((r) => r.rows[0].r);
  assert.equal(e.status, "paid");
  const v = (await pg.query("SELECT version FROM expenses WHERE id=$1", [e.id])).rows[0].version;
  const spend = () => pg.query("SELECT total::text t,status,(SELECT count(*)::int FROM expense_disbursements WHERE expense_id=$1) d FROM expenses WHERE id=$1", [e.id]).then((r) => r.rows[0]);
  const before = await spend();

  // Allocate part of it to the painters; the rest stays as other spending (materials).
  const r = await allocate(e.id, v, [{ memberId: JOHN, amount: "600000" }, { memberId: PETER, amount: "400000" }]);
  assert.equal(r.version, v + 1);
  assert.deepEqual(await spend(), before, "total, status and payments are unchanged");
  assert.equal((await pg.query("SELECT sum(amount)::text s FROM expense_payees WHERE expense_id=$1", [e.id])).rows[0].s, "1000000.00");
  assert.equal((await pg.query("SELECT count(*)::int n FROM expense_events WHERE expense_id=$1 AND action='payees_allocated'", [e.id])).rows[0].n, 1);
  assert.equal((await pg.query("SELECT count(*)::int n FROM expenses")).rows[0].n, 1, "no new expense: project spending is not double-counted");

  // Change it later (replaces the lines), then clear it.
  await allocate(e.id, v + 1, [{ memberId: JOHN, amount: "1000000" }]);
  assert.deepEqual((await pg.query("SELECT project_member_id::text m, amount::text a FROM expense_payees WHERE expense_id=$1", [e.id])).rows, [{ m: JOHN, a: "1000000.00" }]);

  // Guards.
  await fails("SELECT expense_allocate_payees('a','admin',$1::uuid,$2,$3::jsonb,'c')", [e.id, v + 2, JSON.stringify({ key: key(), payees: [{ memberId: JOHN, amount: "2500000.01" }] })], "payees_exceed_total");
  await fails("SELECT expense_allocate_payees('a','admin',$1::uuid,$2,$3::jsonb,'c')", [e.id, v + 2, JSON.stringify({ key: key(), payees: [{ memberId: OUTSIDER, amount: "1" }] })], "payee_not_on_project");
  await fails("SELECT expense_allocate_payees('a','admin',$1::uuid,$2,$3::jsonb,'c')", [e.id, v, JSON.stringify({ key: key(), payees: [] })], "stale_expense");
  await fails("SELECT expense_allocate_payees('a','admin',$1::uuid,$2,$3::jsonb,'c')", [e.id, v + 2, JSON.stringify({ key: key(), payees: [{ memberId: JOHN, amount: "1" }, { memberId: JOHN, amount: "1" }] })], "duplicate_payee");
  // Outside the function, lines on a paid expense stay locked.
  await fails("DELETE FROM expense_payees WHERE expense_id=$1", [e.id], "expense_not_editable");
  await fails("INSERT INTO expense_payees(organization_id,expense_id,project_member_id,amount) VALUES('a',$1,$2,1)", [e.id, PETER], "expense_not_editable");
  // Drafts are not allocated this way (the request form handles them).
  const draft = await pg.query("SELECT expense_save_with_payees('a','admin',$1::jsonb,'c') AS r", [JSON.stringify({ ...base, key: key(), netAmount: "100" })]).then((x) => x.rows[0].r);
  await fails("SELECT expense_allocate_payees('a','admin',$1::uuid,1,$2::jsonb,'c')", [draft.id, JSON.stringify({ key: key(), payees: [] })], "expense_not_allocatable");

  // Team pay on the project reflects the allocation as paid.
  const paid = (await pg.query(`SELECT m.external_name n, coalesce(sum(l.amount) FILTER (WHERE e.status='paid'),0)::text p FROM project_members m
    LEFT JOIN expense_payees l ON l.project_member_id=m.id LEFT JOIN expenses e ON e.id=l.expense_id WHERE m.project_id=$1 GROUP BY m.external_name ORDER BY 1`, [P])).rows;
  assert.deepEqual(paid, [{ n: "John", p: "1000000.00" }, { n: "Peter", p: "0" }]);

  // Instalments: two separate payments to Peter, each with its own date, method and reference (what
  // recordTeamMemberPayment sends), shown as Peter's payment history on the project.
  const pay = (amt, paidOn, method, reference) => pg.query("SELECT expense_record_verified('a','admin',$1::jsonb,'c') AS r", [JSON.stringify({ ...base, key: key(), category: "Labour", description: "Payment to Peter", netAmount: amt, incurredOn: paidOn, payees: [{ memberId: PETER, amount: amt }], payment: { ...cash, method, reference, paidOn } })]).then((x) => x.rows[0].r);
  await pay("300000", "2026-03-10", "cash", "RCPT-7");
  await pay("200000", "2026-04-02", "other", "VOUCHER-12");
  globalThis.__allocDb = drizzle(pg);
  const bundle = await build({ entryPoints: ["lib/projects/workspace.ts"], bundle: true, platform: "node", format: "cjs", write: false, packages: "external", plugins: [{ name: "fixture", setup(b) { b.onResolve({ filter: /^(server-only|next\/cache|@\/database\/db)$/ }, ({ path }) => ({ path, namespace: "fixture" })); b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ loader: "js", contents: path === "server-only" ? "" : path === "next/cache" ? "export function cacheLife(){} export function cacheTag(){} export function revalidateTag(){} export function updateTag(){} export function revalidatePath(){}" : "export const db={execute(q){return globalThis.__allocDb.execute(q)}}" })); } }] });
  await mkdir("tmp", { recursive: true });
  const file = resolve("tmp/alloc-workspace.cjs"); await writeFile(file, bundle.outputFiles[0].contents);
  const { readProjectWorkspace } = createRequire(import.meta.url)(file);
  const w = await readProjectWorkspace("a", P, ["projects_read", "expenses_read"]);
  const peter = w.teamPayments.find((x) => x.name === "Peter");
  assert.deepEqual([peter.agreed, peter.paid], ["800000.00", "500000.00"], "will earn 800k, paid 500k so far, 300k still owed");
  assert.deepEqual(peter.lines.map((l) => [l.amount, l.payments[0].paidOn, l.payments[0].method, l.payments[0].reference]), [["200000.00", "2026-04-02", "other", "VOUCHER-12"], ["300000.00", "2026-03-10", "cash", "RCPT-7"]]);
  assert.equal(w.teamPayments.find((x) => x.name === "John").lines[0].payments[0].paidOn, "2026-03-02", "allocated shares show the original payment date");

  console.log("PASS: approved/paid expenses can be allocated to team members afterwards without changing the total, payments or project spending; allocations are validated, audited and otherwise locked.");
} finally { await pg.close(); delete globalThis.__allocDb; }
