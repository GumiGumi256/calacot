// Prepares an ISOLATED browser-acceptance environment: synthetic Clerk users in a Clerk DEVELOPMENT
// instance and matching staff records in an isolated database (Neon branch or local PostgreSQL).
//
// Usage:  node scripts/setup-isolated-acceptance.mjs .env.isolated            (dry run: prints the plan)
//         node scripts/setup-isolated-acceptance.mjs .env.isolated --confirm  (applies it)
//
// Refuses unless scripts/check-isolated-env.mjs rules pass: development Clerk keys only, an
// allow-listed non-production database host, messaging in capture mode, no live secrets. It never
// reads .env or .env.local. Users get "+clerk_test" addresses on example.com: Clerk development
// instances send no email to them and accept the verification code 424242.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename } from "node:path";
import { randomBytes } from "node:crypto";
import { isolatedEnvironmentProblems } from "./test-safety.mjs";

const file = process.argv[2];
const confirm = process.argv.includes("--confirm");
if (!file || !/isolated/i.test(basename(file)) || [".env", ".env.local"].includes(basename(file))) { console.error("Usage: node scripts/setup-isolated-acceptance.mjs .env.isolated [--confirm]"); process.exit(2); }
const env = {};
for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2"); }
const problems = isolatedEnvironmentProblems(env);
if (!env.CLERK_SECRET_KEY?.startsWith("sk_test_")) problems.push("CLERK_SECRET_KEY (sk_test_) is required to create development users");
if (!env.CALACOT_CLERK_ORG_ID) problems.push("CALACOT_CLERK_ORG_ID (the development organization) is required");
if (problems.length) { console.error("Refusing: environment is not isolated.\n - " + problems.join("\n - ")); process.exit(1); }

// Reviewer: approval authority delegated with custom permissions, plus read access. No role grants.
const reviewerPermissions = ["accounting_read", "banking_read", "tax_read", "fs_read", "accounting_journal_approve", "accounting_journal_post", "accounting_policy_approve",
  "fs_adjust_review", "fs_approve", "close_approve", "year_end_approve", "banking_reconcile_approve", "cash_approve", "tax_approve", "depreciation_approve", "migration_approve"];
const users = [
  { key: "administrator", first: "Acceptance", last: "Administrator", email: "calacot.admin+clerk_test@example.com", role: "org:admin" },
  { key: "finance", first: "Acceptance", last: "Finance", email: "calacot.finance+clerk_test@example.com", role: "org:finance" },
  { key: "reviewer", first: "Acceptance", last: "Reviewer", email: "calacot.reviewer+clerk_test@example.com", role: "org:accounting_reviewer" },
  { key: "readonly", first: "Acceptance", last: "Read-only", email: "calacot.readonly+clerk_test@example.com", role: "org:viewer" },
];
console.log(`Plan (${confirm ? "APPLY" : "dry run"}):`);
console.log(` - Clerk development instance: ensure custom permissions org:calacot:{${reviewerPermissions.join(",")}}`);
console.log(" - Clerk: ensure roles org:finance, org:viewer, org:accounting_reviewer (reviewer carries only the permissions above)");
for (const u of users) console.log(` - Clerk user ${u.email} → ${u.role} in the development organization`);
console.log(" - Isolated database: organization row, one active staff record per user, accounting test-database flag on THIS database only");
if (!confirm) { console.log("\nDry run only. Re-run with --confirm to apply."); process.exit(0); }

const { createClerkClient } = await import("@clerk/backend");
const { Client } = await import("pg");
const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
const org = env.CALACOT_CLERK_ORG_ID;

const perms = new Map((await clerk.organizationPermissions.getOrganizationPermissionList({ limit: 200 })).data.map((p) => [p.key, p.id]));
for (const p of reviewerPermissions) {
  const k = `org:calacot:${p}`;
  if (perms.has(k)) continue;
  const created = await clerk.organizationPermissions.createOrganizationPermission({ key: k, name: p.replaceAll("_", " "), description: "Calacot acceptance (development instance)" });
  perms.set(k, created.id);
}
const roles = new Map((await clerk.organizationRoles.getOrganizationRoleList({ limit: 100 })).data.map((r) => [r.key, r]));
for (const [key, name] of [["org:finance", "Finance"], ["org:viewer", "Read-only"], ["org:accounting_reviewer", "Accounting reviewer"]]) {
  const role = roles.get(key) ?? await clerk.organizationRoles.createOrganizationRole({ key, name, description: "Calacot acceptance role", includeInInitialRoleSet: false });
  if (key === "org:accounting_reviewer") {
    const has = new Set((role.permissions ?? []).map((x) => (typeof x === "string" ? x : x.key)));
    for (const p of reviewerPermissions) if (!has.has(`org:calacot:${p}`)) await clerk.organizationRoles.assignPermissionToOrganizationRole({ organizationRoleId: role.id, permissionId: perms.get(`org:calacot:${p}`) });
  }
  roles.set(key, role);
}
const credentials = [];
for (const u of users) {
  const found = (await clerk.users.getUserList({ emailAddress: [u.email] })).data[0];
  const password = `Acc-${randomBytes(9).toString("base64url")}!9`;
  const user = found ?? await clerk.users.createUser({ emailAddress: [u.email], firstName: u.first, lastName: u.last, password, skipPasswordChecks: false });
  const members = (await clerk.organizations.getOrganizationMembershipList({ organizationId: org, limit: 200 })).data;
  const m = members.find((x) => x.publicUserData?.userId === user.id);
  if (!m) await clerk.organizations.createOrganizationMembership({ organizationId: org, userId: user.id, role: u.role });
  else if (m.role !== u.role) await clerk.organizations.updateOrganizationMembership({ organizationId: org, userId: user.id, role: u.role });
  credentials.push({ key: u.key, email: u.email, userId: user.id, role: u.role, password: found ? "(unchanged: existing user)" : password });
}

const db = new Client({ connectionString: env.DATABASE_URL });
await db.connect();
try {
  await db.query("BEGIN");
  await db.query("INSERT INTO organizations(id,name,legal_name) VALUES($1,'Calacot (acceptance)','Calacot acceptance fixture') ON CONFLICT (id) DO NOTHING", [org]);
  for (const c of credentials) {
    await db.query(`INSERT INTO staff_memberships(organization_id,clerk_user_id,display_name,email,clerk_role,status) VALUES($1,$2,$3,$4,$5,'active')
      ON CONFLICT (organization_id,clerk_user_id) DO UPDATE SET clerk_role=EXCLUDED.clerk_role,status='active'`, [org, c.userId, `Acceptance ${c.key}`, c.email, c.role]);
  }
  // Allows the Phase 2B isolated-test stage on this database only (production never carries it).
  const dbName = (await db.query("SELECT current_database() AS d")).rows[0].d;
  await db.query(`ALTER DATABASE "${dbName.replace(/"/g, "")}" SET calacot.accounting_test_database = 'on'`);
  await db.query("COMMIT");
} catch (e) { await db.query("ROLLBACK"); throw e; } finally { await db.end(); }
await mkdir("tmp", { recursive: true });
await writeFile("tmp/acceptance-users.json", JSON.stringify(credentials, null, 2));
console.log("Done. Synthetic user credentials written to tmp/acceptance-users.json (git-ignored). Sign in with the code 424242 when Clerk asks for email verification.");
