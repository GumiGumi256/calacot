// Self-test of the shared safety rules (scripts/test-safety.mjs). Synthetic values only.
import assert from "node:assert/strict";
import { assertLocalFixtureDatabase, isolatedEnvironmentProblems, liveCredentialProblems, loadsEnvironmentFiles } from "./test-safety.mjs";

assert.ok(assertLocalFixtureDatabase("postgresql://u:p@localhost:55432/phase2e_statements_fixture", "phase2e_statements_fixture"));
assert.throws(() => assertLocalFixtureDatabase("postgresql://u:p@ep-example.neon.tech/phase2e_statements_fixture", "phase2e_statements_fixture"), /not on this machine/);
assert.throws(() => assertLocalFixtureDatabase("postgresql://u:p@localhost/neondb", "phase2e_statements_fixture"), /non-fixture/);

const good = {
  CALACOT_ENVIRONMENT: "isolated-test", CLERK_SECRET_KEY: "sk_test_x", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
  DATABASE_URL: "postgresql://u:p@ep-branch-test.neon.tech/neondb", CALACOT_ISOLATED_DATABASE_HOSTS: "ep-branch-test.neon.tech", CALACOT_PRODUCTION_DATABASE_HOSTS: "ep-production.neon.tech",
  SALES_NOTIFICATION_MODE: "capture", CUSTOMER_CARE_NOTIFICATION_MODE: "capture", CALACOT_APP_URL: "http://localhost:3000",
};
assert.deepEqual(isolatedEnvironmentProblems(good), []);
const bad = (patch, re) => assert.ok(isolatedEnvironmentProblems({ ...good, ...patch }).some((p) => re.test(p)), JSON.stringify(patch));
bad({ CLERK_SECRET_KEY: "sk_live_x" }, /development key/);
bad({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_x" }, /pk_test_/);
bad({ DATABASE_URL: "postgresql://u:p@ep-production.neon.tech/neondb", CALACOT_ISOLATED_DATABASE_HOSTS: "ep-production.neon.tech" }, /production database host/);
bad({ DATABASE_URL: "postgresql://u:p@ep-unknown.neon.tech/neondb" }, /not listed/);
bad({ CALACOT_PRODUCTION_DATABASE_HOSTS: "" }, /must list the production host/);
bad({ WHATSAPP_ACCESS_TOKEN: "x" }, /live messaging/);
bad({ RESEND_API_KEY: "x" }, /live messaging/);
bad({ SALES_NOTIFICATION_MODE: "live" }, /capture/);
bad({ SALES_SEND_ALLOWLIST: "someone@example.com" }, /no real recipient/);
bad({ CALACOT_APP_URL: "https://calacot.example" }, /localhost/);
bad({ CALACOT_ENVIRONMENT: "production" }, /isolated-test/);
bad({ SALES_STORAGE_BUCKET: "live-bucket" }, /CALACOT_ISOLATED_STORAGE_BUCKETS/);

assert.deepEqual(liveCredentialProblems({}), []);
assert.ok(liveCredentialProblems({ CLERK_SECRET_KEY: "sk_live_x" }).length);
assert.ok(liveCredentialProblems({ DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/db" }).length);
assert.deepEqual(liveCredentialProblems({ DATABASE_URL: "postgresql://u:p@localhost/db" }), []);

// Built at run time so this file itself is not mistaken for a loader by the same rule.
assert.equal(loadsEnvironmentFiles(`import {config} from "${"dot" + "env"}"; config({path:[".env.local"]})`), true);
assert.equal(loadsEnvironmentFiles("const x = process.env.FOO;"), false);
console.log("PASS: test safety rules refuse live Clerk keys, production or unlisted databases, live messaging and env-file loaders.");
