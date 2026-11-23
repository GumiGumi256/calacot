// Applies the full drizzle-current chain, in one transaction, to the EMPTY isolated database named in
// an isolated environment file. Refuses production hosts (scripts/test-safety.mjs) and any database
// that already has tables. Usage: node scripts/apply-isolated-migrations.mjs .env.isolated
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { isolatedEnvironmentProblems } from "./test-safety.mjs";

const file = process.argv[2];
if (!file || !/isolated/i.test(basename(file)) || [".env", ".env.local"].includes(basename(file))) { console.error("Usage: node scripts/apply-isolated-migrations.mjs .env.isolated"); process.exit(2); }
const env = {};
for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2"); }
const problems = isolatedEnvironmentProblems(env);
if (problems.length) { console.error("Refusing: environment is not isolated.\n - " + problems.join("\n - ")); process.exit(1); }
const { Client } = await import("pg");
const db = new Client({ connectionString: env.DATABASE_URL });
await db.connect();
try {
  if ((await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n) throw new Error("Refusing: the isolated database is not empty");
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  const t = Date.now();
  await db.query("BEGIN");
  try { for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await db.query(s); await db.query("COMMIT"); }
  catch (e) { await db.query("ROLLBACK"); throw e; }
  console.log(`Applied ${journal.entries.length} migrations to the isolated database in ${Date.now() - t} ms.`);
} finally { await db.end(); }
