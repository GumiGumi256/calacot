// Phase 1F: documents and operational reports on a disposable PGlite database migrated with
// drizzle-current (0000-0013). Real routes, actions, reads, permission code and SQL; Clerk is a
// stateful fake organization and private storage is an in-memory map.
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

process.env.CALACOT_CLERK_ORG_ID = "a";
const pg = new PGlite();
const passed = [];
const check = async (name, fn) => { await fn(); passed.push(name); };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(200, 32)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A'),('b','B','B');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,display_name,clerk_role,status,employee_eligibility,eligibility_decided_by,eligibility_decided_at) VALUES
      ('${id(1)}','a','user_admin','Admin','org:admin','active','pending',NULL,NULL),('${id(2)}','a','user_sales','Sales','org:sales','active','pending',NULL,NULL),
      ('${id(3)}','a','user_fin','Finance','org:finance','active','pending',NULL,NULL),('${id(4)}','a','user_pm','PM','org:project_manager','active','pending',NULL,NULL),
      ('${id(5)}','a','user_emp','Employee','org:member','active','approved','user_admin',now()),('${id(6)}','a','user_viewer','Viewer','org:viewer','active','pending',NULL,NULL),
      ('${id(7)}','b','user_other','Other','org:admin','active','pending',NULL,NULL);
    INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES('${id(10)}','a','company','Client A','architecture'),('${id(11)}','b','company','Client B','tech');
    INSERT INTO projects(id,organization_id,client_id,code,name,division,currency,status,completed_at) VALUES('${id(12)}','a','${id(10)}','P-1','Villa','architecture','UGX','active',NULL),('${id(13)}','a','${id(10)}','P-2','Office','tech','USD','completed',now()),('${id(14)}','b','${id(11)}','P-B','Other','tech','UGX','active',NULL);
    INSERT INTO tasks(id,organization_id,project_id,title,status,assignee_id,due_at,completed_at) VALUES('${id(15)}','a','${id(12)}','Survey','todo','${id(4)}',now()-interval '3 days',NULL),('${id(16)}','a','${id(12)}','Design','completed','${id(4)}',now()+interval '3 days',now());
    INSERT INTO project_milestones(id,organization_id,project_id,title,position,status) VALUES('${id(17)}','a','${id(12)}','Approval',0,'pending');
    INSERT INTO expenses(id,organization_id,division,category,description,net_amount,total,currency,status,incurred_at,requested_by_id) VALUES('${id(18)}','a','architecture','Materials','Cement',100,100,'UGX','draft',now(),'${id(5)}');
    INSERT INTO documents(id,organization_id,name,kind,storage_key,mime_type,size_bytes,sha256,created_by_clerk_user_id) VALUES('${id(19)}','a','receipt.pdf','expense_receipt','finance/expenses/x/y','application/pdf',10,'${"a".repeat(64)}','user_emp');
    INSERT INTO document_links(organization_id,document_id,expense_id) VALUES('a','${id(19)}','${id(18)}');
    INSERT INTO invoices(id,organization_id,client_id,project_id,number,status,customer_snapshot,issuer_snapshot,currency,subtotal,total,issued_at,due_on) VALUES
      ('${id(20)}','a','${id(10)}','${id(12)}','CAL-I-1','issued','{"name":"Client A"}','{"legalName":"A"}','UGX',500000,500000,now(),current_date-5),
      ('${id(21)}','a','${id(10)}','${id(13)}','CAL-I-2','issued','{"name":"Client A"}','{"legalName":"A"}','USD',300,300,now(),current_date+5);
    INSERT INTO documents(id,organization_id,name,kind,storage_key,mime_type,size_bytes,sha256,version) VALUES('${id(22)}','a','CAL-I-1.pdf','invoice','commercial/x/invoice/1/v1.pdf','application/pdf',10,'${"b".repeat(64)}',1);
    INSERT INTO document_links(organization_id,document_id,invoice_id) VALUES('a','${id(22)}','${id(20)}');
    INSERT INTO leads(id,type,full_name,email,phone,service,status,organization_id,division,created_at) VALUES('${id(23)}','contact_inquiry','L1','l1@example.test','+256700000001','tech','new','a','tech',now()),('${id(24)}','contact_inquiry','L2','l2@example.test','+256700000002','tech','closed_won','a','tech',now());
    INSERT INTO crm_source_links(organization_id,lead_id,client_id) VALUES('a','${id(24)}','${id(10)}');`);
  await pg.query("SELECT sales_payment('a','user_fin',$1::jsonb,'t')", [JSON.stringify({ command: "submit", invoiceId: id(20), amount: "200000", method: "bank_transfer", reference: "R1", receivedAt: new Date().toISOString(), key: crypto.randomUUID(), evidence: "" })]);
  const payId = (await pg.query("SELECT id FROM payments LIMIT 1")).rows[0].id;
  await pg.query("SELECT sales_payment('a','user_fin',$1::jsonb,'t')", [JSON.stringify({ command: "verify", invoiceId: id(20), paymentId: payId, amount: "150000", method: "bank_transfer", reference: "R1", receivedAt: new Date().toISOString(), key: crypto.randomUUID(), evidence: "Statement" })]);

  const members = { a: new Map([["user_admin", "org:admin"], ["user_sales", "org:sales"], ["user_fin", "org:finance"], ["user_pm", "org:project_manager"], ["user_emp", "org:member"], ["user_viewer", "org:viewer"]]), b: new Map([["user_other", "org:admin"]]) };
  const store = new Map();
  const c = (globalThis.__docs = { db: drizzle(pg), als: new AsyncLocalStorage(), session: { userId: "user_admin", orgId: "a", orgRole: "org:admin" }, store,
    clerk: { organizations: { async getOrganizationMembershipList({ organizationId, userId }) { const m = members[organizationId] ?? new Map(); const data = (userId ?? [...m.keys()]).filter((u) => m.has(u)).map((u) => ({ organization: { id: organizationId }, role: m.get(u), permissions: [], publicUserData: { userId: u } })); return { data, totalCount: data.length }; } } } });
  const entry = `export { POST as upload } from "./app/api/documents/route"; export { GET as download } from "./app/api/documents/[id]/route";
    export { GET as exportCsv } from "./app/api/reports/export/route";
    export { archiveDocument } from "./lib/documents/actions"; export { readDocuments, readDocumentDetail, uploadTargets } from "./lib/documents/reads";
    export { readOperationalReport } from "./lib/reports/operational"; export { toCsv, csvCell } from "./lib/reports/csv";`;
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{ name: "isolated", setup(b) {
      b.onResolve({ filter: /^(server-only|next\/cache|next\/headers|next\/navigation|@\/database\/db|@clerk\/nextjs\/server|@\/lib\/sales\/storage)$/ }, ({ path }) => ({ path, namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => {
        const g = "const c=globalThis.__docs;";
        if (path === "server-only") return { loader: "js", contents: "" };
        if (path === "next/cache") return { loader: "js", contents: "export function revalidatePath(){} export function revalidateTag(){} export function updateTag(){} export function cacheTag(){} export function cacheLife(){}" };
        if (path === "next/headers") return { loader: "js", contents: "export async function headers(){return new Headers({host:'app.test',origin:'http://app.test'})}" };
        if (path === "next/navigation") return { loader: "js", contents: "export function notFound(){throw new Error('NEXT_NOT_FOUND')} export function redirect(u){throw new Error('REDIRECT:'+u)}" };
        if (path === "@clerk/nextjs/server") return { loader: "js", contents: g + "export async function auth(){const s=c.als.getStore()||c.session;return {...s,orgSlug:'calacot',has(){return false},redirectToSignIn(){throw new Error('signin')}}} export async function clerkClient(){return c.clerk} export async function currentUser(){return null}" };
        if (path.endsWith("storage")) return { loader: "js", contents: g + "export async function storePrivateObject(k,b,t,max){if(b.length>max)throw new Error('document_size_limit');if(c.store.has(k))throw new Error('overwrite');c.store.set(k,{b,t})} export async function loadPrivateObject(k){const o=c.store.get(k);if(!o)throw new Error('missing');return o.b} export async function storePdf(){} export async function loadPdf(){return Buffer.alloc(0)}" };
        return { loader: "js", contents: g + "export const db={execute(q){return c.db.execute(q)}}" };
      });
    } }] });
  await mkdir("tmp", { recursive: true });
  const file = resolve("tmp/phase1f-docs.cjs");
  await writeFile(file, bundle.outputFiles[0].contents);
  const m = createRequire(import.meta.url)(file);
  const as = (userId, orgRole = members.a.get(userId), orgId = "a") => { c.session = { userId, orgId, orgRole }; };
  const q = async (t, p = []) => (await pg.query(t, p)).rows;
  const up = (o, bytes = PDF, name = "plan.pdf", origin = "http://app.test") => {
    const body = new FormData(); body.set("file", new File([bytes], name)); body.set("documentId", o.documentId ?? crypto.randomUUID());
    for (const [k, v] of Object.entries(o)) if (k !== "documentId") body.set(k, v);
    return m.upload(new Request("http://app.test/api/documents", { method: "POST", body, headers: { host: "app.test", ...(origin ? { origin } : {}) } }));
  };
  const get = (docId) => m.download(new Request(`http://app.test/api/documents/${docId}`), { params: Promise.resolve({ id: docId }) });
  const fd = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

  let projectDoc;
  await check("uploads: authorized roles, record permissions, origin and cross-organization denial", async () => {
    as("user_pm");
    const r = await up({ kind: "drawing", linkType: "project", linkId: id(12) });
    assert.equal(r.status, 200, (await r.clone().json()).message); projectDoc = (await r.json()).id;
    assert.equal((await up({ kind: "drawing", linkType: "project", linkId: id(12) }, PDF, "x.pdf", "http://evil.test")).status, 403, "cross-origin upload refused");
    assert.equal((await up({ kind: "staff_record", linkType: "staff", linkId: id(2) })).status, 404, "project manager cannot attach to staff records");
    assert.equal((await up({ kind: "policy", linkType: "company" })).status, 404, "company records need settings_manage");
    as("user_emp");
    assert.equal((await up({ kind: "drawing", linkType: "project", linkId: id(12) })).status, 404, "approved employee has no document workspace");
    as("user_viewer");
    assert.equal((await up({ kind: "drawing", linkType: "project", linkId: id(12) })).status, 404, "read-only cannot upload");
    as("user_pm");
    assert.equal((await up({ kind: "drawing", linkType: "project", linkId: id(14) })).status, 409, "other organization's project refused by the database");
    as("user_other", "org:admin", "b");
    assert.equal((await up({ kind: "drawing", linkType: "project", linkId: id(12) })).status, 404, "other organization's session refused");
    as("user_admin");
    for (const [type, linkId, kind] of [["client", id(10), "contract"], ["task", id(15), "photo"], ["milestone", id(17), "report"], ["staff", id(2), "staff_record"], ["company", "", "policy"]]) {
      const res = await up({ kind, linkType: type, linkId });
      assert.equal(res.status, 200, `${type}: ${(await res.clone().json()).message}`);
    }
    assert.equal((await q("SELECT count(*)::int AS n FROM audit_logs WHERE action='document.upload'"))[0].n, 6);
  });

  await check("file validation: content signatures, macro and legacy formats, size, safe names", async () => {
    as("user_admin");
    assert.equal((await up({ kind: "other", linkType: "client", linkId: id(10) }, Buffer.from("MZ\x90\x00 executable"), "invoice.pdf")).status, 400, "executable disguised as PDF refused");
    assert.equal((await up({ kind: "other", linkType: "client", linkId: id(10) }, Buffer.from("<html><script>x</script>"), "a.png")).status, 400);
    const docm = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("word/document.xml word/vbaProject.bin")]);
    assert.equal((await up({ kind: "other", linkType: "client", linkId: id(10) }, docm, "macro.docx")).status, 400, "macro-enabled Office file refused");
    const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("[Content_Types].xml word/document.xml")]);
    const okDocx = await up({ kind: "contract", linkType: "client", linkId: id(10) }, docx, "../../etc/agreement.docx");
    assert.equal(okDocx.status, 200);
    const dId = (await okDocx.json()).id;
    assert.equal((await q("SELECT name,mime_type FROM documents WHERE id=$1", [dId]))[0].name, "agreement.docx", "path components stripped");
    assert.equal((await up({ kind: "other", linkType: "client", linkId: id(10) }, Buffer.concat([PDF, Buffer.alloc(21 * 1024 * 1024)]), "big.pdf")).status, 400, "over 20 MB refused");
    const res = await get(dId);
    assert.match(res.headers.get("content-disposition"), /^attachment;/, "Office files download as attachments");
  });

  await check("record-level visibility: most restrictive link wins, financial documents need finance permissions", async () => {
    const names = async () => (await m.readDocuments({ size: "100" })).rows.map((r) => r.name).sort();
    as("user_sales");
    const sales = await names();
    assert(sales.includes("plan.pdf") && sales.includes("agreement.docx"));
    assert(!sales.includes("receipt.pdf"), "expense evidence hidden from sales");
    assert(sales.includes("CAL-I-1.pdf"), "sales has invoices_read");
    assert(!sales.some((n) => n.startsWith("plan") && false));
    assert.equal((await get(id(19))).status, 404, "sales cannot download expense evidence");
    as("user_pm");
    const pm = await names();
    assert(!pm.includes("CAL-I-1.pdf") && !pm.includes("receipt.pdf"), "project manager cannot see financial documents");
    assert(!pm.some((n) => n.includes("staff")), "staff records hidden");
    as("user_fin");
    assert((await names()).includes("receipt.pdf"));
    as("user_viewer");
    assert.equal((await get(projectDoc)).status, 200, "read-only may download project documents");
    as("user_other", "org:admin", "b");
    assert.equal((await get(projectDoc)).status, 404, "cross-organization download refused");
    as("user_admin");
    const dl = await get(projectDoc);
    assert.equal(dl.status, 200); assert.equal(dl.headers.get("cache-control"), "private, no-store"); assert.match(dl.headers.get("content-security-policy"), /sandbox/);
    assert((await q("SELECT count(*)::int AS n FROM audit_logs WHERE action='document.download'"))[0].n >= 3);
  });

  await check("versioning: revisions are new immutable rows, history kept, concurrent revision conflicts", async () => {
    as("user_pm");
    const v2 = await up({ supersedesId: projectDoc }, PNG, "plan-v2.png");
    assert.equal(v2.status, 200, (await v2.clone().json()).message);
    const v2id = (await v2.json()).id;
    const conflict = await up({ supersedesId: projectDoc }, PDF, "plan-v2b.pdf");
    assert.equal(conflict.status, 409, "second revision of the same version refused"); assert.match((await conflict.json()).message, /newer version/);
    const [a, b] = await Promise.all([up({ supersedesId: v2id }, PDF, "v3a.pdf"), up({ supersedesId: v2id }, PDF, "v3b.pdf")]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409], "simultaneous revisions: exactly one wins");
    const detail = await m.readDocumentDetail(projectDoc);
    assert.deepEqual(detail.versions.map((v) => v.version), [3, 2, 1]);
    assert.equal((await get(projectDoc)).status, 200, "old versions remain downloadable");
    await assert.rejects(pg.query("UPDATE documents SET name='changed' WHERE id=$1", [projectDoc]), /document_immutable/);
    await assert.rejects(pg.query("DELETE FROM documents WHERE id=$1", [projectDoc]), /document_immutable/);
    await assert.rejects(pg.query("DELETE FROM document_links WHERE document_id=$1", [projectDoc]), /document_link_immutable/);
    await pg.query("UPDATE documents SET storage_key=storage_key WHERE id=$1", [id(22)]);
    const retry = await up({ documentId: v2id, supersedesId: projectDoc }, PNG, "plan-v2.png");
    assert.equal(retry.status, 200, "retry of the same upload is idempotent");
    const before = [...store.entries()].find(([k]) => k.startsWith(`documents/${v2id}/`))[1].b;
    const attack = await up({ documentId: v2id, supersedesId: projectDoc }, PDF, "tampered.pdf");
    assert.equal(attack.status, 409, "re-posting an existing id with different bytes is refused");
    assert.equal([...store.keys()].filter((k) => k.startsWith(`documents/${v2id}/`)).length, 1, "no second object written for an existing id");
    assert(before.equals([...store.entries()].find(([k]) => k.startsWith(`documents/${v2id}/`))[1].b), "stored bytes unchanged");
  });

  await check("financial artifacts and evidence cannot be revised or archived; archival is admin-only and audited", async () => {
    as("user_admin");
    assert.equal((await up({ supersedesId: id(22) })).status, 409, "issued invoice artifact cannot be revised");
    assert.equal((await up({ supersedesId: id(19) })).status, 409, "expense evidence cannot be revised");
    assert.match((await m.archiveDocument({}, fd({ documentId: id(22), reason: "Clean up invoices" }))).message, /cannot be archived/);
    await assert.rejects(pg.query("SELECT document_archive('a','user_admin',$1,'Direct call','t')", [id(19)]), /financial_document_immutable/);
    as("user_pm");
    await assert.rejects(m.archiveDocument({}, fd({ documentId: projectDoc, reason: "Superseded drawing" })), /NEXT_NOT_FOUND/, "project managers cannot archive");
    as("user_admin");
    assert.equal((await m.archiveDocument({}, fd({ documentId: projectDoc, reason: "Superseded drawing set" }))).ok, true);
    assert.equal((await q("SELECT count(*)::int AS n FROM documents WHERE coalesce(family_id,id)=$1 AND archived_at IS NOT NULL", [projectDoc]))[0].n, 3, "all versions archived");
    as("user_pm");
    assert.equal((await up({ supersedesId: projectDoc }, PDF, "late.pdf")).status, 409, "archived document cannot be revised");
    assert((await m.readDocuments({ status: "archived" })).rows.some((r) => r.root === projectDoc), "archived documents remain listed in the archive view");
    await assert.rejects(pg.query("UPDATE documents SET archived_at=NULL WHERE id=$1", [projectDoc]), /document_immutable/, "archival is one-way");
  });

  await check("staff suspension, removal and eligibility revoke document access", async () => {
    const live = (await q("SELECT id FROM documents WHERE name='agreement.docx'"))[0].id;
    as("user_sales");
    assert.equal((await get(live)).status, 200);
    await pg.query("UPDATE staff_memberships SET status='suspended',suspended_at=now(),suspended_by='user_admin',suspension_reason='Investigation' WHERE clerk_user_id='user_sales'");
    assert.equal((await get(live)).status, 404, "suspended staff refused");
    await pg.query("UPDATE staff_memberships SET status='active',suspended_at=NULL,suspended_by=NULL,suspension_reason=NULL WHERE clerk_user_id='user_sales'");
    members.a.delete("user_viewer");
    as("user_viewer", "org:viewer");
    assert.equal((await get(live)).status, 404, "removed member refused even with a valid session (live check)");
    await assert.rejects(m.readDocuments({}), /NEXT_NOT_FOUND/);
  });

  await check("reports: accuracy, currency separation, scoping, permissions and CSV export safety", async () => {
    as("user_admin");
    const sales = await m.readOperationalReport({ section: "sales" });
    const t = (r, key) => r.tables.find((x) => x.key === key);
    assert.equal(t(sales, "lead_conversion").rows[0].received, 2); assert.equal(t(sales, "lead_conversion").rows[0].converted, 1);
    const out = Object.fromEntries(t(sales, "outstanding").rows.map((r) => [r.currency, r]));
    assert.equal(Number(out.UGX.outstanding), 350000, "outstanding from the invoice ledger"); assert.equal(Number(out.UGX.overdue), 350000);
    assert.equal(Number(out.USD.outstanding), 300); assert.equal(Number(out.USD.overdue), 0);
    assert(t(sales, "invoiced").rows.every((r) => ["UGX", "USD"].includes(r.currency)) && t(sales, "invoiced").rows.length === 2, "currencies reported separately");
    assert.equal(Number(t(sales, "collections").rows.find((r) => r.currency === "UGX").collected), 200000);
    const usd = await m.readOperationalReport({ section: "sales", currency: "USD" });
    assert(t(usd, "outstanding").rows.every((r) => r.currency === "USD"));
    const scoped = await m.readOperationalReport({ section: "sales", projectId: id(12) });
    assert.equal(Number(t(scoped, "collections").rows[0].collected), 150000, "project-scoped collections use allocations");
    const proj = await m.readOperationalReport({ section: "projects" });
    const villa = t(proj, "project_progress").rows.find((r) => r.project === "P-1 Villa");
    assert.deepEqual([villa.tasks_done, villa.tasks_total, villa.tasks_overdue, villa.milestones_total], [1, 2, 1, 1]);
    assert.equal(t(proj, "overdue_tasks").rows.length, 1);
    const staff = await m.readOperationalReport({ section: "staff" });
    const pmRow = t(staff, "workload").rows.find((r) => r.employee === "PM");
    assert.deepEqual([pmRow.open_tasks, pmRow.overdue_tasks, pmRow.completed_tasks], [1, 1, 1]);
    as("user_pm");
    const pmView = await m.readOperationalReport({ section: "staff" });
    assert.deepEqual(pmView.allowed, ["sales", "projects"], "project managers: sales (leads/quotations) and projects only"); assert.equal(pmView.section, "sales", "staff section not available, falls back");
    assert.deepEqual(pmView.tables.map((x) => x.key), ["leads_by_status", "lead_conversion", "quotations_by_status"], "no invoice, balance or collection data for project managers");
    const pmProjects = await m.readOperationalReport({ section: "projects" });
    assert(!pmProjects.tables.some((x) => x.key === "project_expenditure"), "no expenditure without expenses_read");
    const denied = await m.exportCsv(new Request("http://app.test/api/reports/export?section=finance&table=pending_disbursements"));
    assert.equal(denied.status, 404, "export cannot reach a section the user lacks");
    as("user_emp");
    await assert.rejects(m.readOperationalReport({}), /NEXT_NOT_FOUND/, "employees have no reports");
    as("user_fin");
    const csvRes = await m.exportCsv(new Request("http://app.test/api/reports/export?section=finance&table=outstanding_invoices&currency=UGX"));
    assert.equal(csvRes.status, 200); const csv = await csvRes.text();
    assert.match(csv, /UGX/); assert(!/"USD"/.test(csv), "currency filter applied to export");
    assert((await q("SELECT count(*)::int AS n FROM audit_logs WHERE action='report.export'"))[0].n >= 1);
    assert.equal(m.csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
    assert.equal(m.csvCell("+1+1"), "\"'+1+1\""); assert.equal(m.csvCell("@SUM(A1)"), "\"'@SUM(A1)\""); assert.equal(m.csvCell("  -cmd"), "\"'  -cmd\""); assert.equal(m.csvCell("\tx"), "\"'\tx\"");
    assert.equal(m.csvCell("-150.50"), "\"-150.50\"", "plain negative numbers unchanged"); assert.equal(m.csvCell(42), "\"42\"");
    await pg.query("UPDATE projects SET name='=cmd|calc' WHERE id=$1", [id(12)]);
    as("user_admin");
    const inj = await (await m.exportCsv(new Request("http://app.test/api/reports/export?section=projects&table=project_progress"))).text();
    assert(inj.includes("\"'P-1 =cmd|calc\"") || inj.includes("P-1 =cmd|calc"), "project names exported as text");
    assert(!inj.split("\r\n").some((l) => l.startsWith("\"=")), "no cell starts with a formula");
  });

  console.log(`PASS (${passed.length} groups):\n- ${passed.join("\n- ")}`);
} finally { await pg.close(); delete globalThis.__docs; }
