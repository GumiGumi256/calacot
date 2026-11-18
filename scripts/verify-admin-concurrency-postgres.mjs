// Phase 1E: overlapping administrative transactions on real PostgreSQL (two connections).
// Usage: echo "<connection string>" | node scripts/verify-admin-concurrency-postgres.mjs
// Refuses any database not named phase1e_admin_fixture; migrates only an empty database.
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

let input = ""; for await (const chunk of process.stdin) input += chunk;
const url = new URL(input.trim());
if (url.pathname !== "/phase1e_admin_fixture") throw Error("Refusing non-fixture database");
const a = new Client({ connectionString: url.toString() }), b = new Client({ connectionString: url.toString() });
await a.connect(); await b.connect();
const settle = (p) => { const s = { done: false }; s.result = p.then((v) => { s.done = true; return v; }, (e) => { s.done = true; return e; }); return s; };
const pause = () => new Promise((r) => setTimeout(r, 700));
const passed = [];
try {
  if (!(await a.query("SELECT 1 FROM information_schema.tables WHERE table_name='company_settings_versions'")).rowCount) {
    if ((await a.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n) throw Error("Fixture not empty; refusing");
    const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
    await a.query("BEGIN");
    try { for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await a.query(s); await a.query("COMMIT"); } catch (e) { await a.query("ROLLBACK"); throw e; }
    passed.push(`migration chain 0000-${journal.entries.at(-1).tag} applied in one transaction`);
  }
  const org = "phase1e-" + randomUUID();
  await a.query("INSERT INTO organizations(id,name,legal_name) VALUES($1,'Fixture','Fixture Ltd')", [org]);
  for (const u of ["adm1", "adm2", "emp"]) await a.query("INSERT INTO staff_memberships(organization_id,clerk_user_id,status) VALUES($1,$2,'active')", [org, u]);
  const settings = (legalName, bank = null) => JSON.stringify({ identity: { legalName, tradingName: "", taxIdentifier: "" }, contacts: { email: "", phone: "" }, address: { line1: "", city: "", country: "" }, divisions: [], payment: { bank, mobile: null }, defaults: { defaultCurrency: "UGX" } });
  const baseline = settings("Fixture Ltd");
  const propose = (c, actor, base, s) => c.query("SELECT company_settings_propose($1,$2,$3,$4::jsonb,$5::jsonb,'Concurrent change',$6,'t') AS r", [org, actor, base, s, baseline, randomUUID()]);
  const overlap = async (name, first, second, check) => {
    await a.query("BEGIN"); await b.query("BEGIN");
    await first(a);
    const s = settle(second(b));
    await pause(); assert.equal(s.done, false, `${name}: second transaction must wait`);
    await a.query("COMMIT");
    const r = await s.result; await b.query(r instanceof Error ? "ROLLBACK" : "COMMIT");
    await check(r); passed.push(name);
  };
  await overlap("two administrators saving settings from the same version: second is stale", (c) => propose(c, "adm1", 0, settings("Name A")), (c) => propose(c, "adm2", 0, settings("Name B")), async (r) => {
    assert.match(String(r), /stale_settings/);
    assert.equal((await a.query("SELECT legal_name FROM organizations WHERE id=$1", [org])).rows[0].legal_name, "Name A");
  });
  const proposal = (await propose(a, "adm1", 1, settings("Name A", { name: "Bank", number: "1", account: "X", swift: "", currency: "UGX" }))).rows[0].r.id;
  await overlap("approve and reject racing on one proposal: one decision", (c) => c.query("SELECT company_settings_decide($1,'adm2',$2,'approve','Verified with bank','t')", [org, proposal]), (c) => c.query("SELECT company_settings_decide($1,'emp',$2,'reject','Not verified yet','t') AS r", [org, proposal]), async (r) => {
    assert.match(String(r.rows ? JSON.stringify(r.rows[0]) : r), /settings_proposal_unavailable/);
    assert.equal((await a.query("SELECT status FROM company_settings_versions WHERE id=$1", [proposal])).rows[0].status, "approved");
  });
  const sid = (await a.query("SELECT id FROM staff_memberships WHERE organization_id=$1 AND clerk_user_id='emp'", [org])).rows[0].id;
  await overlap("two administrators editing one staff profile version: second is stale", (c) => c.query("SELECT staff_profile_save($1,'adm1',$2,1,$3::jsonb,'t')", [org, sid, JSON.stringify({ division: "tech", jobTitle: "A" })]),
    (c) => c.query("SELECT staff_profile_save($1,'adm2',$2,1,$3::jsonb,'t')", [org, sid, JSON.stringify({ division: "estates", jobTitle: "B" })]), async (r) => assert.match(String(r), /stale_staff_record/));
  // Membership lease: overlapping holders cannot both acquire.
  const [l1, l2] = await Promise.all([a.query("SELECT admin_lease_acquire($1,'membership','h1',30) AS ok", [org]), b.query("SELECT admin_lease_acquire($1,'membership','h2',30) AS ok", [org])]);
  assert.equal([l1.rows[0].ok, l2.rows[0].ok].filter(Boolean).length, 1);
  passed.push("concurrent membership-lease acquisition: exactly one holder");
  console.log(`PASS on ${(await a.query("SELECT version()")).rows[0].version.split(" ").slice(0, 2).join(" ")} (${passed.length}):\n- ${passed.join("\n- ")}`);
} finally { await a.end(); await b.end(); }
