// Phase 1E: staff administration, permissions, Clerk synchronization and company settings on a
// disposable PGlite database migrated with drizzle-current 0000-0011. Clerk is replaced by a
// stateful in-memory fake organization; application code and SQL are the real implementation.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

const pg = new PGlite();
const passed = [];
const check = async (name, fn) => { await fn(); passed.push(name); };
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) if (v !== undefined) f.set(k, typeof v === "string" ? v : JSON.stringify(v)); return f; };
process.env.CALACOT_CLERK_ORG_ID = "a";
process.env.CLERK_WEBHOOK_SIGNING_SECRET = "whsec_test";
process.env.STAFF_SYNC_SECRET = "s".repeat(40);
try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec(`INSERT INTO organizations(id,name,legal_name,email) VALUES('a','Calacot','Calacot Group Uganda Ltd','info@example.test'),('b','B','B',NULL);
    INSERT INTO staff_memberships(organization_id,clerk_user_id,display_name,clerk_role,status) VALUES('a','user_admin1','Admin One','org:admin','active'),('a','user_admin2','Admin Two','org:admin','active'),('a','user_sales','Sales Person','org:sales','active'),('a','user_fin','Finance Person','org:finance','active'),('b','user_other','Other','org:admin','active');`);

  // Fake Clerk organization 'a' (and 'b'): the source of truth.
  const members = { a: new Map([["user_admin1", "org:admin"], ["user_admin2", "org:admin"], ["user_sales", "org:sales"], ["user_fin", "org:finance"]]), b: new Map([["user_other", "org:admin"]]) };
  const roles = new Set(["org:admin", "org:member", "org:sales", "org:finance", "org:viewer"]);
  const invitations = [];
  const c = (globalThis.__staffAdmin = {
    db: drizzle(pg), session: { userId: "user_admin1", orgId: "a", orgRole: "org:admin" }, als: new AsyncLocalStorage(), clerkDown: false, delay: 0,
    clerk: {
      organizations: {
        async getOrganizationMembershipList({ organizationId, userId, role }) {
          if (c.clerkDown) throw Error("offline");
          if (c.delay) await new Promise((r) => setTimeout(r, c.delay));
          const m = members[organizationId] ?? new Map();
          const ids = (userId ?? [...m.keys()]).filter((u) => m.has(u) && (!role || role.includes(m.get(u))));
          const data = ids.map((u) => ({ organization: { id: organizationId }, role: m.get(u), permissions: [], publicUserData: { userId: u, firstName: u.replace("user_", ""), lastName: null, identifier: `${u}@example.test` } }));
          return { data, totalCount: data.length };
        },
        async createOrganizationInvitation(p) { if (!roles.has(p.role)) throw Error("role"); const inv = { id: `orginv_${invitations.length + 1}`, emailAddress: p.emailAddress, role: p.role, status: "pending", createdAt: Date.now(), expiresAt: null }; invitations.push(inv); return inv; },
        async revokeOrganizationInvitation({ invitationId }) { const i = invitations.find((x) => x.id === invitationId); if (!i) throw Error("missing"); i.status = "revoked"; return i; },
        async getOrganizationInvitationList() { return { data: invitations, totalCount: invitations.length }; },
        async updateOrganizationMembership({ organizationId, userId, role }) { if (c.delay) await new Promise((r) => setTimeout(r, c.delay)); members[organizationId].set(userId, role); },
        async deleteOrganizationMembership({ organizationId, userId }) { members[organizationId].delete(userId); },
      },
      organizationRoles: { async getOrganizationRoleList() { return { data: [...roles].map((key) => ({ key })) }; } },
    },
  });
  const entry = `export { inviteStaff, revokeInvitation, changeStaffRole, removeStaffMember, saveStaffProfile, setStaffStatus, setEmployeeEligibility } from "./lib/admin/staff-actions";
    export { proposeSettings, decideSettings } from "./lib/admin/settings-actions";
    export { readStaffDirectory } from "./lib/admin/staff";
    export { staffContext, roleAllows } from "./lib/sales/permissions";
    export { liveStaffContext } from "./lib/admin/clerk-auth";
    export { approvedPaymentInstructions } from "./lib/company";
    export { saveExpense } from "./lib/finance/actions";
    export { readFinancialReports } from "./lib/finance/reports";
    export { effectiveGrants, staffAccessStatus } from "./lib/sales/permissions";
    export { POST as webhook } from "./app/api/webhooks/clerk/route";
    export { POST as cron } from "./app/api/staff-sync/route";`;
  const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{ name: "isolated", setup(b) {
      b.onResolve({ filter: /^(server-only|next\/cache|next\/headers|next\/navigation|@\/database\/db|@clerk\/nextjs\/server|@clerk\/nextjs\/webhooks)$/ }, ({ path }) => ({ path, namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => {
        const g = "const c=globalThis.__staffAdmin;";
        if (path === "server-only") return { loader: "js", contents: "" };
        if (path === "next/cache") return { loader: "js", contents: "export function revalidatePath(){} export function revalidateTag(){} export function updateTag(){} export function cacheTag(){} export function cacheLife(){}" };
        if (path === "next/headers") return { loader: "js", contents: "export async function headers(){return new Headers({host:'app.test',origin:'http://app.test'})}" };
        if (path === "next/navigation") return { loader: "js", contents: "export function notFound(){throw new Error('NEXT_NOT_FOUND')}" };
        if (path === "@clerk/nextjs/webhooks") return { loader: "js", contents: "export async function verifyWebhook(req){if(req.headers.get('svix-signature')!=='valid')throw new Error('bad');return JSON.parse(await req.text())}" };
        if (path === "@clerk/nextjs/server") return { loader: "js", contents: g + "export async function auth(){const s=c.als.getStore()||c.session;return {...s,orgSlug:'calacot',has(){return false},redirectToSignIn(){throw new Error('signin')}}} export async function clerkClient(){return c.clerk} export async function currentUser(){return null}" };
        return { loader: "js", contents: g + "export const db={execute(q){return c.db.execute(q)}}" };
      });
    } }],
  });
  await mkdir("tmp", { recursive: true });
  const file = resolve("tmp/phase1e-staff.cjs");
  await writeFile(file, bundle.outputFiles[0].contents);
  const m = createRequire(import.meta.url)(file);
  const q = async (t, p = []) => (await pg.query(t, p)).rows;
  const as = (userId, orgRole = members.a.get(userId), orgId = "a") => { c.session = { userId, orgId, orgRole }; };
  const syncAll = () => m.cron(new Request("http://app.test/api/staff-sync", { method: "POST", headers: { authorization: `Bearer ${process.env.STAFF_SYNC_SECRET}` } }));
  const staff = async (u) => (await q("SELECT id,profile_version,status,clerk_role FROM staff_memberships WHERE organization_id='a' AND clerk_user_id=$1", [u]))[0];

  await check("role matrix: least privilege and separation of sensitive duties", async () => {
    const r = m.roleAllows;
    for (const p of ["staff_manage", "settings_manage", "finance_accounts_manage"]) for (const role of ["org:finance", "org:sales", "org:project_manager", "org:member", "org:viewer"]) assert.equal(r(role, p), false, `${role} must not have ${p}`);
    assert.equal(r("org:admin", "staff_manage"), true);
    for (const p of ["expenses_approve", "expenses_disburse", "expenses_reconcile", "payments_verify", "invoices_issue"]) for (const role of ["org:project_manager", "org:member", "org:sales", "org:viewer"]) assert.equal(r(role, p), false, `${role} must not have ${p}`);
    for (const role of ["org:finance", "org:sales", "org:project_manager", "org:member", "org:viewer"]) for (const p of ["expenses_create", "expenses_submit", "expenses_review", "expenses_approve"]) {
      assert.equal(r(role, p), false);
      assert.equal(m.effectiveGrants(role, () => true, { status: "active", eligibility: "approved" }).includes(p), false, `${role} cannot receive ${p} through custom grants`);
    }
    for (const p of ["expenses_create", "expenses_submit", "expenses_review", "expenses_approve"]) assert.equal(r("org:admin", p), true);
    assert.equal(r("org:member", "projects_read"), false);
    assert.equal(r("org:project_manager", "projects_write"), true);
    assert.equal(r("org:viewer", "leads_write"), false);
    assert.equal(r("org:unknown", "clients_read"), false);
  });

  await check("invitation: Clerk invite, role limits, unconfigured roles, masked audit, revoke", async () => {
    as("user_admin1");
    const ok = await m.inviteStaff({}, form({ email: "new.person@example.test", role: "org:member", division: "tech" }));
    assert.equal(ok.ok, true, ok.message);
    assert.equal(invitations[0].role, "org:member");
    const a = (await q("SELECT changes FROM audit_logs WHERE action='staff.invite'"))[0].changes;
    assert.equal(a.email, "n***@example.test", "invitation email masked in audit");
    assert.match((await m.inviteStaff({}, form({ email: "pm@example.test", role: "org:project_manager" }))).message, /not configured in Clerk/);
    assert.match((await m.inviteStaff({}, form({ email: "x", role: "org:member" }))).message, /valid email/);
    assert.equal((await m.revokeInvitation({}, form({ invitationId: "orginv_1" }))).ok, true);
    assert.equal(invitations[0].status, "revoked");
    as("user_sales");
    await assert.rejects(m.inviteStaff({}, form({ email: "y@example.test", role: "org:admin" })), /NEXT_NOT_FOUND/, "sales cannot invite");
    as("user_fin");
    await assert.rejects(m.inviteStaff({}, form({ email: "y@example.test", role: "org:member" })), /NEXT_NOT_FOUND/, "finance cannot invite");
  });

  await check("role changes: no self-change, Clerk updated, mirror synced, audited", async () => {
    as("user_admin1");
    assert.match((await m.changeStaffRole({}, form({ userId: "user_admin1", role: "org:member", reason: "Testing self" }))).message, /own role/);
    const r = await m.changeStaffRole({}, form({ userId: "user_sales", role: "org:viewer", reason: "Moved to read-only" }));
    assert.equal(r.ok, true, r.message);
    assert.equal(members.a.get("user_sales"), "org:viewer");
    assert.equal((await staff("user_sales")).clerk_role, "org:viewer");
    const ev = (await q("SELECT changes FROM audit_logs WHERE action='staff.role_change'"))[0].changes;
    assert.deepEqual([ev.from, ev.to, ev.reason], ["org:sales", "org:viewer", "Moved to read-only"]);
    assert.match((await m.changeStaffRole({}, form({ userId: "user_nobody", role: "org:viewer", reason: "Missing member" }))).message, /no longer a member/);
  });

  await check("no privilege escalation by sessions that are stale or lack rights", async () => {
    as("user_sales", "org:admin"); // stale session still claims admin; Clerk says viewer
    await assert.rejects(m.changeStaffRole({}, form({ userId: "user_sales", role: "org:admin", reason: "Promote myself" })), /NEXT_NOT_FOUND/);
    await assert.rejects(m.liveStaffContext("staff_manage"), /NEXT_NOT_FOUND/);
    assert.equal(members.a.get("user_sales"), "org:viewer");
  });

  await check("last administrator protected, including concurrent mutual demotion", async () => {
    // Two administrators demote each other at the same moment (each call has its own session).
    c.delay = 20;
    const asUser = (userId, fn) => c.als.run({ userId, orgId: "a", orgRole: "org:admin" }, fn);
    const [x, y] = await Promise.all([
      asUser("user_admin1", () => m.changeStaffRole({}, form({ userId: "user_admin2", role: "org:member", reason: "Concurrent A" }))),
      asUser("user_admin2", () => m.changeStaffRole({}, form({ userId: "user_admin1", role: "org:member", reason: "Concurrent B" }))),
    ]);
    c.delay = 0;
    const admins = [...members.a.entries()].filter(([, r]) => r === "org:admin").map(([u]) => u);
    assert.equal(admins.length, 1, `exactly one administrator must remain: ${x.message} / ${y.message}`);
    assert.equal([x, y].filter((r) => r.ok).length, 1, "only one of the mutual demotions succeeds");
    assert.match([x, y].find((r) => !r.ok).message, /without an active administrator|in progress/);
    members.a.set(admins[0] === "user_admin1" ? "user_admin2" : "user_admin1", "org:admin"); // restore for later checks
    await syncAll();
    // Suspending an administrator is allowed only while another active administrator remains.
    as("user_admin2");
    const s1 = await staff("user_admin1");
    assert.equal((await m.setStaffStatus({}, form({ staffId: s1.id, version: String(s1.profile_version), status: "suspended", reason: "Leave of absence" }))).ok, true);
    as("user_admin2");
    assert.match((await m.changeStaffRole({}, form({ userId: "user_admin2", role: "org:member", reason: "Demote myself" }))).message, /own role/);
  });

  await check("suspension denies access immediately even with a valid Clerk session; self-suspension refused", async () => {
    as("user_admin1");
    await assert.rejects(m.staffContext(), /NEXT_NOT_FOUND/, "suspended administrator refused by staffContext");
    as("user_admin2");
    const s1 = await staff("user_admin1");
    assert.equal((await m.setStaffStatus({}, form({ staffId: s1.id, version: String(s1.profile_version), status: "active", reason: "Returned from leave" }))).ok, true);
    as("user_admin1");
    assert.equal((await m.staffContext()).actor, "user_admin1");
    const me = await staff("user_admin1");
    assert.match((await m.setStaffStatus({}, form({ staffId: me.id, version: String(me.profile_version), status: "suspended", reason: "Suspend myself" }))).message, /own role|own/);
    const fin = await staff("user_fin");
    assert.match((await m.setStaffStatus({}, form({ staffId: fin.id, version: "999", status: "suspended", reason: "Stale version" }))).message, /changed since/);
    const ev = await q("SELECT action FROM audit_logs WHERE action IN ('staff.suspend','staff.reactivate') ORDER BY created_at");
    assert.deepEqual(ev.map((e) => e.action), ["staff.suspend", "staff.reactivate"]);
  });

  await check("membership removal revokes access immediately and keeps history", async () => {
    as("user_admin1");
    const r = await m.removeStaffMember({}, form({ userId: "user_fin", reason: "Left the company" }));
    assert.equal(r.ok, true, r.message);
    assert.equal(members.a.has("user_fin"), false);
    assert.equal((await staff("user_fin")).status, "removed");
    as("user_fin", "org:finance"); // session token not yet expired
    await assert.rejects(m.liveStaffContext("expenses_approve"), /NEXT_NOT_FOUND/, "revoked member refused on mutations");
    assert.equal((await q("SELECT count(*)::int AS n FROM audit_logs WHERE action='staff.remove'"))[0].n, 1);
    members.a.set("user_fin", "org:finance"); // re-invited and accepted later
  });

  await check("lead and task assignment eligibility excludes suspended and removed staff", async () => {
    await pg.exec("INSERT INTO leads(id,type,full_name,email,phone,service,status,organization_id) VALUES('00000000-0000-4000-8000-0000000000aa','contact_inquiry','Lead','l@example.test','+256700000000','tech','new','a')");
    const fin = await staff("user_fin");
    await assert.rejects(pg.query(`SELECT lead_update('a','user_admin1','00000000-0000-4000-8000-0000000000aa',$1::jsonb)`, [JSON.stringify({ status: "new", assignedStaffId: fin.id })]), /invalid_assignee/, "removed staff not assignable");
    as("user_admin1");
    const sales = await staff("user_sales");
    await m.setStaffStatus({}, form({ staffId: sales.id, version: String(sales.profile_version), status: "suspended", reason: "Investigation" }));
    await assert.rejects(pg.query(`SELECT lead_update('a','user_admin1','00000000-0000-4000-8000-0000000000aa',$1::jsonb)`, [JSON.stringify({ status: "new", assignedStaffId: sales.id })]), /invalid_assignee/, "suspended staff not assignable");
  });

  await check("profile and division assignment with optimistic concurrency and audit", async () => {
    as("user_admin1");
    const s = await staff("user_sales");
    const save = (v, title) => m.saveStaffProfile({}, form({ staffId: s.id, version: String(v), division: "architecture", jobTitle: title, responsibilities: "Client follow-up" }));
    const [x, y] = await Promise.all([save(s.profile_version, "Coordinator"), save(s.profile_version, "Manager")]);
    assert.equal([x, y].filter((r) => r.ok).length, 1, "only one concurrent edit of the same version succeeds");
    assert.equal((await q("SELECT division FROM staff_memberships WHERE id=$1", [s.id]))[0].division, "architecture");
    assert.match((await m.saveStaffProfile({}, form({ staffId: s.id, version: "1", division: "nowhere" }))).message, /division/);
    assert.equal((await q("SELECT changes FROM audit_logs WHERE action='staff.profile'"))[0].changes.divisionTo, "architecture");
  });

  await check("Clerk webhook: signature, duplicates, out-of-order events, failure and retry", async () => {
    const send = (id, type, user, sig = "valid") => m.webhook(Object.assign(new Request("http://app.test/api/webhooks/clerk", { method: "POST", headers: { "svix-id": id, "svix-signature": sig }, body: JSON.stringify({ type, data: { organization: { id: "a" }, public_user_data: { user_id: user } } }) })));
    assert.equal((await send("d0", "organizationMembership.created", "user_new", "forged")).status, 400);
    members.a.set("user_new", "org:member");
    assert.equal((await send("d1", "organizationMembership.created", "user_new")).status, 200);
    assert.equal((await staff("user_new")).status, "active");
    assert.equal(await (await send("d1", "organizationMembership.created", "user_new")).text(), "Duplicate delivery");
    members.a.set("user_new", "org:sales");
    // A stale 'created' arriving after the role update still converges on Clerk's current state.
    assert.equal((await send("d2", "organizationMembership.updated", "user_new")).status, 200);
    assert.equal((await send("d3", "organizationMembership.created", "user_new")).status, 200);
    assert.equal((await staff("user_new")).clerk_role, "org:sales");
    // A late 'deleted' for someone who is (again) a member does not remove them.
    assert.equal((await send("d4", "organizationMembership.deleted", "user_new")).status, 200);
    assert.equal((await staff("user_new")).status, "active");
    c.clerkDown = true;
    members.a.delete("user_new");
    assert.equal((await send("d5", "organizationMembership.deleted", "user_new")).status, 500, "failure makes Svix retry");
    c.clerkDown = false;
    assert.equal((await send("d5", "organizationMembership.deleted", "user_new")).status, 200, "retry of failed delivery processed");
    assert.equal((await staff("user_new")).status, "removed");
    assert.equal((await q("SELECT status,attempts FROM clerk_webhook_events WHERE id='d5'"))[0].attempts, 2);
    const other = await m.webhook(new Request("http://app.test/x", { method: "POST", headers: { "svix-id": "d6", "svix-signature": "valid" }, body: JSON.stringify({ type: "organizationMembership.created", data: { organization: { id: "b" }, public_user_data: { user_id: "user_x" } } }) }));
    assert.equal(await other.text(), "Ignored", "other organizations are ignored");
  });

  await check("scheduled reconciliation recovers missed events and requires its secret", async () => {
    members.a.set("user_missed", "org:viewer");
    assert.equal((await m.cron(new Request("http://app.test/api/staff-sync", { method: "POST", headers: { authorization: "Bearer wrong" } }))).status, 401);
    const r = await m.cron(new Request("http://app.test/api/staff-sync", { method: "POST", headers: { authorization: `Bearer ${process.env.STAFF_SYNC_SECRET}` } }));
    assert.equal(r.status, 200);
    assert.equal((await staff("user_missed")).clerk_role, "org:viewer");
    assert.equal((await staff("user_sales")).status, "suspended", "local suspension preserved by reconciliation");
    assert.equal((await q("SELECT count(*)::int AS n FROM staff_memberships WHERE organization_id='b' AND clerk_user_id='user_other' AND status='active'"))[0].n, 1, "other organization untouched");
  });

  await check("cross-organization access denied", async () => {
    as("user_other", "org:admin", "b");
    await assert.rejects(m.staffContext(), /NEXT_NOT_FOUND/, "only the configured Calacot organization is accepted");
  });

  await check("company settings: immediate business changes, two-person payment approval, snapshots preserved", async () => {
    await pg.exec(`INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES('00000000-0000-4000-8000-0000000000c1','a','company','Client','tech');
      INSERT INTO invoices(id,organization_id,client_id,number,status,customer_snapshot,issuer_snapshot,currency,subtotal,total,issued_at) VALUES('00000000-0000-4000-8000-0000000000c2','a','00000000-0000-4000-8000-0000000000c1','CAL-I-1','issued','{"name":"Client"}','{"legalName":"Calacot Group Uganda Ltd"}','UGX',100,100,now())`);
    as("user_admin1");
    const base = { identity: { legalName: "Calacot Group Uganda Limited", tradingName: "Calacot", taxIdentifier: "1000000000" }, contacts: { email: "info@example.test", phone: "+256700000001" }, address: { line1: "Plot 1", city: "Kampala", country: "Uganda" },
      divisions: ["estates", "architecture", "painting", "interiors", "tech"].map((key) => ({ key, label: key, enabled: true })), payment: { bank: null, mobile: null }, defaults: { defaultCurrency: "UGX" } };
    const r1 = await m.proposeSettings({}, form({ settings: base, baseVersion: "0", note: "Initial company profile", key: crypto.randomUUID() }));
    assert.equal(r1.ok, true, r1.message); assert.match(r1.message, /Settings saved/);
    assert.equal((await q("SELECT legal_name FROM organizations WHERE id='a'"))[0].legal_name, "Calacot Group Uganda Limited");
    assert.equal((await q("SELECT issuer_snapshot->>'legalName' AS n FROM invoices WHERE number='CAL-I-1'"))[0].n, "Calacot Group Uganda Ltd", "issued snapshot unchanged");
    assert.match((await m.proposeSettings({}, form({ settings: base, baseVersion: "0", note: "Stale copy", key: crypto.randomUUID() }))).message, /changed since/);
    const pay = { ...base, payment: { bank: { name: "Bank", number: "123", account: "Calacot", swift: "", currency: "UGX" }, mobile: null } };
    const r2 = await m.proposeSettings({}, form({ settings: pay, baseVersion: "1", note: "New bank account", key: crypto.randomUUID() }));
    assert.match(r2.message, /proposal/);
    assert.equal((await m.approvedPaymentInstructions("a")).bank, null, "proposal not effective yet");
    const proposal = (await q("SELECT id FROM company_settings_versions WHERE status='proposed'"))[0].id;
    assert.match((await m.decideSettings({}, form({ versionId: proposal, decision: "approve", note: "Self approve" }))).message, /cannot approve your own/);
    await assert.rejects(pg.query("UPDATE company_settings_versions SET status='approved',decided_by=proposed_by,decided_at=now() WHERE id=$1", [proposal]), /two_person_check/, "database blocks self-approval");
    as("user_fin", "org:finance");
    await assert.rejects(m.decideSettings({}, form({ versionId: proposal, decision: "approve", note: "Finance approval" })), /NEXT_NOT_FOUND/, "finance cannot approve settings");
    as("user_admin2");
    assert.equal((await m.decideSettings({}, form({ versionId: proposal, decision: "approve", note: "Verified against bank letter" }))).ok, true);
    assert.equal((await m.approvedPaymentInstructions("a")).bank.number, "123");
    await assert.rejects(pg.query("DELETE FROM company_settings_versions"), /settings_history_immutable/);
    await assert.rejects(pg.query("UPDATE company_settings_versions SET note='rewritten' WHERE version=1"), /settings_history_immutable/);
    const audit = await q("SELECT action FROM audit_logs WHERE entity_type='company_settings' ORDER BY created_at");
    assert.deepEqual(audit.map((a) => a.action), ["settings.update", "settings.propose", "settings.approve"]);
    assert.equal(JSON.stringify(audit).includes("whsec"), false);
  });

  await check("directory lists Clerk members, invitations and suspended/removed staff; read-only when Clerk is down", async () => {
    as("user_admin1");
    const d = await m.readStaffDirectory({});
    assert(d.rows.some((r) => r.userId === "user_sales" && r.status === "suspended"));
    assert(d.rows.some((r) => r.userId === "user_new" && r.status === "removed"));
    assert.equal(d.clerkAvailable, true);
    c.clerkDown = true;
    const down = await m.readStaffDirectory({});
    c.clerkDown = false;
    assert.equal(down.clerkAvailable, false);
    assert(down.rows.length > 0, "falls back to last synced mirror");
    as("user_sales", "org:sales");
    await assert.rejects(m.readStaffDirectory({}), /NEXT_NOT_FOUND/);
  });


  // ---- Phase 1E stabilization ----
  await check("employee eligibility: unapproved org:member has no access; approval is admin-controlled, revocable and server-enforced", async () => {
    members.a.set("user_emp", "org:member");
    await syncAll();
    as("user_emp", "org:member");
    await assert.rejects(m.staffContext(), /NEXT_NOT_FOUND/, "unverified member receives no permissions");
    await assert.rejects(m.saveExpense({}, form({ key: crypto.randomUUID(), division: "tech", category: "Travel", description: "Taxi", purpose: "Client site visit", currency: "UGX", netAmount: "1000", incurredOn: "2026-01-02" })), /NEXT_NOT_FOUND/, "cannot request expenses before approval");
    const emp = await staff("user_emp");
    assert.equal((await q("SELECT employee_eligibility FROM staff_memberships WHERE id=$1", [emp.id]))[0].employee_eligibility, "pending");
    as("user_emp", "org:member");
    await assert.rejects(m.setEmployeeEligibility({}, form({ staffId: emp.id, version: String(emp.profile_version), eligibility: "approved", reason: "Approve myself" })), /NEXT_NOT_FOUND/, "member cannot approve self");
    as("user_admin1");
    assert.equal((await m.setEmployeeEligibility({}, form({ staffId: emp.id, version: String(emp.profile_version), eligibility: "approved", reason: "Signed contract on file" }))).ok, true);
    as("user_emp", "org:member");
    await assert.rejects(m.staffContext(), /NEXT_NOT_FOUND/, "approved employees need an assigned role to access the administration area");
    await assert.rejects(m.staffContext("projects_read"), /NEXT_NOT_FOUND/, "no project access for employees");
    as("user_admin1");
    const v = (await staff("user_emp")).profile_version;
    assert.equal((await m.setEmployeeEligibility({}, form({ staffId: emp.id, version: String(v), eligibility: "revoked", reason: "Contract ended" }))).ok, true);
    as("user_emp", "org:member");
    await assert.rejects(m.staffContext(), /NEXT_NOT_FOUND/, "revoked approval removes access");
    // A local approved record is never proof of membership.
    await pg.query("UPDATE staff_memberships SET employee_eligibility='approved',eligibility_decided_by='x',eligibility_decided_at=now() WHERE id=$1", [emp.id]);
    members.a.delete("user_emp");
    as("user_emp", "org:member");
    await assert.rejects(m.liveStaffContext("expenses_create"), /NEXT_NOT_FOUND/, "approved local record without Clerk membership is refused");
    as("user_admin1");
    const w = (await staff("user_emp")).profile_version;
    assert.match((await m.setEmployeeEligibility({}, form({ staffId: emp.id, version: String(w), eligibility: "revoked", reason: "Cleanup after departure" }))).message, /Employee approval revoked/);
    const s = (await staff("user_emp"));
    assert.match((await m.setEmployeeEligibility({}, form({ staffId: s.id, version: String(s.profile_version), eligibility: "approved", reason: "Re-approve departed" }))).message, /no longer a member/, "cannot approve someone not in Clerk");
    const named = m.effectiveGrants("org:sales", () => false, null);
    assert(named.includes("leads_write"), "named roles keep their access without an eligibility record");
    const audit = await q("SELECT action FROM audit_logs WHERE action LIKE 'staff.eligibility%' ORDER BY created_at");
    assert.deepEqual(audit.map((a) => a.action), ["staff.eligibility_approve", "staff.eligibility_revoke", "staff.eligibility_revoke"]);
  });

  await check("disabled divisions rejected server-side for new and changed records; historical records preserved", async () => {
    await pg.exec(`INSERT INTO projects(id,organization_id,client_id,code,name,division,currency) VALUES('00000000-0000-4000-8000-0000000000d1','a','00000000-0000-4000-8000-0000000000c1','HIST','Historic painting','painting','UGX')`);
    as("user_admin1");
    const cur = await q("SELECT version,settings FROM company_settings_versions WHERE organization_id='a' AND status='approved' ORDER BY version DESC LIMIT 1");
    const next = { ...cur[0].settings, divisions: cur[0].settings.divisions.map((d) => (d.key === "painting" ? { ...d, enabled: false } : d)) };
    assert.equal((await m.proposeSettings({}, form({ settings: next, baseVersion: String(cur[0].version), note: "Painting paused", key: crypto.randomUUID() }))).ok, true);
    const draft = (division, projectId = "") => m.saveExpense({}, form({ key: crypto.randomUUID(), division, projectId, category: "Materials", description: "Paint", purpose: "Exterior works", currency: "UGX", netAmount: "5000", incurredOn: "2026-01-02" }));
    assert.match((await draft("painting")).message, /not currently enabled/, "expense in disabled division rejected");
    assert.equal((await draft("tech")).ok, true, "enabled division accepted");
    await assert.rejects(pg.query(`INSERT INTO projects(organization_id,client_id,code,name,division,currency) VALUES('a','00000000-0000-4000-8000-0000000000c1','NEW','New','painting','UGX')`), /division_disabled/, "new project in disabled division rejected");
    await pg.query("UPDATE projects SET name='Historic painting (renamed)' WHERE code='HIST'");
    assert.equal((await q("SELECT division FROM projects WHERE code='HIST'"))[0].division, "painting", "historical record still editable and unchanged");
    await pg.exec("INSERT INTO projects(organization_id,client_id,code,name,division,currency) VALUES('a','00000000-0000-4000-8000-0000000000c1','TECH','Tech','tech','UGX')");
    await assert.rejects(pg.query("UPDATE projects SET division='painting' WHERE code='TECH'"), /division_disabled/, "moving a record into a disabled division rejected");
    await assert.rejects(pg.query(`SELECT lead_update('a','user_admin1','00000000-0000-4000-8000-0000000000aa',$1::jsonb)`, [JSON.stringify({ status: "new", division: "painting" })]), /division_disabled/, "lead assignment to disabled division rejected");
    const sales = await staff("user_admin2");
    assert.match((await m.saveStaffProfile({}, form({ staffId: sales.id, version: String(sales.profile_version), division: "painting" }))).message, /not currently enabled/, "staff division assignment rejected");
  });

  await check("sensitive reads re-verify Clerk live; non-sensitive staff do not call Clerk; outage behaviour", async () => {
    let calls = 0;
    const original = c.clerk.organizations.getOrganizationMembershipList;
    c.clerk.organizations.getOrganizationMembershipList = async (p) => { calls++; return original(p); };
    // A finance user demoted in Clerk (outside this app) is refused on finance reads at once
    // when no recent verification is cached for them.
    members.a.set("user_fin2", "org:viewer");
    as("user_fin2", "org:finance");
    await assert.rejects(m.staffContext("expenses_approve"), /NEXT_NOT_FOUND/, "stale finance claim refused");
    await assert.rejects(m.readFinancialReports({}), /NEXT_NOT_FOUND/, "reports refused for stale finance claim");
    // Project managers and employees (no sensitive grants) stay session-only: no Clerk request per page.
    members.a.set("user_pm", "org:project_manager");
    as("user_pm", "org:project_manager");
    calls = 0;
    await m.staffContext("leads_read");
    await m.staffContext("projects_read");
    // Phase 1F: project managers hold documents_read (sensitive), so they get ONE cached live check.
    assert(calls <= 1, "at most one cached Clerk call across project-manager pages");
    // Finance pages: one live call, then cached for 30 seconds.
    members.a.set("user_fin3", "org:finance");
    await syncAll();
    as("user_fin3", "org:finance");
    calls = 0;
    await m.staffContext("payments_read"); await m.staffContext("invoices_read"); await m.staffContext();
    assert.equal(calls, 1, "live verification cached across sensitive reads");
    // Clerk outage: recent verification allows reads; mutations (fresh) fail closed.
    c.clerkDown = true;
    await m.staffContext("payments_read");
    await assert.rejects(m.liveStaffContext("payments_read"), /NEXT_NOT_FOUND/, "mutations fail closed during Clerk outage");
    c.clerkDown = false;
    // Removal through the app invalidates the cached verification immediately.
    as("user_admin1");
    assert.equal((await m.removeStaffMember({}, form({ userId: "user_fin3", reason: "Contract ended" }))).ok, true);
    as("user_fin3", "org:finance");
    await assert.rejects(m.staffContext("payments_read"), /NEXT_NOT_FOUND/, "removed user refused on next sensitive read");
    c.clerk.organizations.getOrganizationMembershipList = original;
  });
  await check("access-pending routing: members without access are classified, outsiders learn nothing, no Clerk call on the fast path", async () => {
    let calls = 0;
    const original = c.clerk.organizations.getOrganizationMembershipList;
    c.clerk.organizations.getOrganizationMembershipList = async (p) => { calls++; return original(p); };
    members.a.set("user_wait", "org:member");
    await syncAll();
    as("user_wait", "org:member");
    assert.deepEqual(await m.staffAccessStatus().then((s) => [s.kind, s.role]), ["awaiting_assignment", "org:member"], "invited member awaiting approval");
    members.a.set("user_unmapped", "org:custom_unmapped");
    as("user_unmapped", "org:custom_unmapped");
    assert.equal((await m.staffAccessStatus()).kind, "awaiting_assignment", "role without admin access awaits assignment");
    as("user_admin1");
    const w = await staff("user_wait");
    assert.equal((await m.setEmployeeEligibility({}, form({ staffId: w.id, version: String(w.profile_version), eligibility: "approved", reason: "Contract verified" }))).ok, true);
    as("user_wait", "org:member");
    calls = 0;
    assert.equal((await m.staffAccessStatus()).kind, "awaiting_assignment");
    as("user_admin1");
    const w2 = await staff("user_wait");
    assert.equal((await m.setEmployeeEligibility({}, form({ staffId: w2.id, version: String(w2.profile_version), eligibility: "revoked", reason: "Contract ended" }))).ok, true);
    as("user_wait", "org:member");
    assert.deepEqual(await m.staffAccessStatus().then((s) => [s.kind, s.reason]), ["paused", "approval_revoked"]);
    as("user_admin1");
    const sales = await staff("user_sales"); // suspended earlier in this suite
    assert.equal(sales.status, "suspended");
    as("user_sales", "org:sales");
    assert.deepEqual(await m.staffAccessStatus().then((s) => [s.kind, s.reason]), ["paused", "suspended"]);
    as("user_fin_gone", "org:finance");
    // A stale session still claiming finance takes the fast path; staffContext then verifies live and refuses.
    assert.equal((await m.staffAccessStatus()).kind, "granted");
    await assert.rejects(m.staffContext(), /NEXT_NOT_FOUND/, "stale session for a removed member is refused, not routed to the holding page");
    as("user_other", "org:admin", "b");
    assert.equal((await m.staffAccessStatus()).kind, "not_member", "other organizations are told nothing");
    c.clerkDown = true;
    as("user_wait2", "org:member");
    assert.equal((await m.staffAccessStatus()).kind, "not_member", "Clerk outage fails closed to not_member");
    c.clerkDown = false;
    c.clerk.organizations.getOrganizationMembershipList = original;
  });

  console.log(`PASS (${passed.length} groups):\n- ${passed.join("\n- ")}`);
} finally {
  await pg.close();
  delete globalThis.__staffAdmin;
}
