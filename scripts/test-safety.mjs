// Shared safety rules for every test, benchmark and acceptance run. Pure functions: nothing here
// reads .env files, connects anywhere or prints a secret value (only variable NAMES are reported).

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Fixture databases for real-PostgreSQL suites: local host and the suite's own fixture name only. */
export function assertLocalFixtureDatabase(raw, fixtureName) {
  const url = new URL(raw);
  if (url.pathname !== `/${fixtureName}`) throw new Error("Refusing non-fixture database");
  if (!LOCAL_HOSTS.has(url.hostname)) throw new Error("Refusing a database that is not on this machine (fixtures run on a throwaway local PostgreSQL)");
  return url;
}

const MESSAGING_SECRETS = ["WHATSAPP_ACCESS_TOKEN", "RESEND_API_KEY", "META_APP_SECRET", "SALES_RESEND_WEBHOOK_SECRET", "TWILIO_AUTH_TOKEN", "TWILIO_API_SECRET"];
const PRODUCTION_ONLY_SECRETS = ["SANITY_API_WRITE_TOKEN", "CLERK_WEBHOOK_SIGNING_SECRET"];

/**
 * Rules for an isolated environment (browser acceptance or a dev server on a test branch).
 * Returns a list of problems that name variables only. An empty list means the environment is safe.
 */
export function isolatedEnvironmentProblems(env) {
  const p = [];
  const has = (k) => typeof env[k] === "string" && env[k].trim() !== "";
  if (env.CALACOT_ENVIRONMENT !== "isolated-test") p.push("CALACOT_ENVIRONMENT must be exactly isolated-test");
  if (has("CLERK_SECRET_KEY") && !env.CLERK_SECRET_KEY.startsWith("sk_test_")) p.push("CLERK_SECRET_KEY must be a development key (sk_test_); live keys are refused");
  if (!has("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") || !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith("pk_test_")) p.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a development key (pk_test_)");
  if (!has("DATABASE_URL")) p.push("DATABASE_URL is required (an isolated Neon branch or local PostgreSQL)");
  else {
    let host = "";
    try { host = new URL(env.DATABASE_URL).hostname; } catch { p.push("DATABASE_URL is not a valid URL"); }
    const allowed = (env.CALACOT_ISOLATED_DATABASE_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const production = (env.CALACOT_PRODUCTION_DATABASE_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (host && production.includes(host)) p.push("DATABASE_URL points at a production database host");
    if (host && !LOCAL_HOSTS.has(host) && !allowed.includes(host)) p.push("DATABASE_URL host is not listed in CALACOT_ISOLATED_DATABASE_HOSTS");
    if (host && !LOCAL_HOSTS.has(host) && !production.length) p.push("CALACOT_PRODUCTION_DATABASE_HOSTS must list the production host(s) so they can be refused");
  }
  for (const k of MESSAGING_SECRETS) if (has(k)) p.push(`${k} must be empty: live messaging is disabled in isolated environments`);
  for (const k of PRODUCTION_ONLY_SECRETS) if (has(k)) p.push(`${k} must be empty in isolated environments`);
  if ((env.SALES_NOTIFICATION_MODE ?? "capture") !== "capture") p.push("SALES_NOTIFICATION_MODE must be capture (messages are written to tmp/sales-capture, never sent)");
  if ((env.CUSTOMER_CARE_NOTIFICATION_MODE ?? "capture") !== "capture") p.push("CUSTOMER_CARE_NOTIFICATION_MODE must be capture");
  if (env.CUSTOMER_CARE_ENABLED === "true") p.push("CUSTOMER_CARE_ENABLED must not be true");
  if (has("SALES_SEND_ALLOWLIST")) p.push("SALES_SEND_ALLOWLIST must be empty (no real recipient)");
  if (has("CALACOT_APP_URL")) { try { if (!LOCAL_HOSTS.has(new URL(env.CALACOT_APP_URL).hostname)) p.push("CALACOT_APP_URL must be a localhost URL"); } catch { p.push("CALACOT_APP_URL is not a valid URL"); } }
  if (has("SALES_STORAGE_BUCKET")) {
    const buckets = (env.CALACOT_ISOLATED_STORAGE_BUCKETS ?? "").split(",").map((s) => s.trim());
    if (!buckets.includes(env.SALES_STORAGE_BUCKET)) p.push("SALES_STORAGE_BUCKET is not listed in CALACOT_ISOLATED_STORAGE_BUCKETS");
  }
  return p;
}

/** For automated suites: the process environment must not carry live credentials at all. */
export function liveCredentialProblems(env) {
  const p = [];
  if ((env.CLERK_SECRET_KEY ?? "").startsWith("sk_live_")) p.push("CLERK_SECRET_KEY is a live key");
  if ((env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").startsWith("pk_live_")) p.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is a live key");
  for (const k of [...MESSAGING_SECRETS, ...PRODUCTION_ONLY_SECRETS]) if ((env[k] ?? "").trim()) p.push(`${k} is set`);
  if ((env.DATABASE_URL ?? "").trim()) {
    try { if (!LOCAL_HOSTS.has(new URL(env.DATABASE_URL).hostname)) p.push("DATABASE_URL points at a remote database"); } catch { p.push("DATABASE_URL is set"); }
  }
  return p;
}

/** Scripts that load environment files or reach live services by design; never run automatically. */
export function loadsEnvironmentFiles(source) {
  return /from\s+["']dotenv["']|import\(["']dotenv["']\)|require\(["']dotenv["']\)|loadEnvConfig|@next\/env/.test(source);
}
