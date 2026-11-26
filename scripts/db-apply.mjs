// One command to bring a database up to date with drizzle-current/:  npm run db:apply
//
//   npm run db:apply                       dev database from .env.local (DATABASE_URL_UNPOOLED or DATABASE_URL)
//   npm run db:apply -- --env .env.prod    another env file, e.g. one pulled with `vercel env pull`
//   npm run db:apply -- --dry-run          rehearse only: apply everything pending, then roll back
//   npm run db:apply -- --status           show what is applied and what is pending; change nothing
//   npm run db:apply -- --baseline 0028_whatsapp_recipient_follows_contact
//                                          first run only: record that migrations up to this tag are applied
//   npm run db:apply -- --yes              skip the confirmation prompt (non-dev databases)
//
// Applied migrations are recorded in public.calacot_migrations (tag, sha256 of the file, applied_at).
// Drizzle's drizzle.__drizzle_migrations is not used: it was never kept in step with these databases.
// On the first run against an existing database the applied point is detected from the tables, columns,
// indexes and triggers each migration creates; nothing is re-run. Pending migrations are rehearsed in a
// rolled-back transaction, then applied together in one transaction, so a failure changes nothing.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

const DIR = "drizzle-current";
const sha = (s) => createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex");
const statements = (sql) => sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);

/** Reads the journal and each migration file. */
export async function loadMigrations(dir = DIR) {
  const journal = JSON.parse(await readFile(`${dir}/meta/_journal.json`, "utf8"));
  const list = await Promise.all(journal.entries.map(async (e) => {
    const sql = await readFile(`${dir}/${e.tag}.sql`, "utf8");
    return { idx: e.idx, tag: e.tag, sql, hash: sha(sql), markers: markers(sql), drops: drops(sql) };
  }));
  // An object a later migration drops proves nothing about the earlier one: do not check for it.
  for (const m of list) {
    const later = new Set(list.filter((x) => x.idx > m.idx).flatMap((x) => x.drops));
    m.markers = m.markers.filter((x) => !later.has(x.kind === "column" ? `${x.table}.${x.name}` : x.name));
  }
  return list;
}

/** Names of tables, indexes, triggers and columns a migration drops. */
function drops(sql) {
  const s = sql.replace(/\$\$[\s\S]*?\$\$/g, "''").replace(/--[^\n]*/g, "").replace(/"/g, "");
  const out = [];
  for (const m of s.matchAll(/DROP\s+(?:TABLE|INDEX|TRIGGER)\s+(?:IF\s+EXISTS\s+)?([\w.]+)/gi)) out.push(m[1].replace(/^public\./, ""));
  for (const m of s.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w.]+)\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(\w+)/gi)) out.push(`${m[1].replace(/^public\./, "")}.${m[2]}`);
  return out;
}

/** Objects a migration creates that can be checked for, ignoring comments and function bodies. */
export function markers(sql) {
  const s = sql.replace(/\$\$[\s\S]*?\$\$/g, "''").replace(/--[^\n]*/g, "");
  const name = (x) => x.replace(/"/g, "").replace(/^public\./, "");
  const out = [];
  for (const m of s.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w.]+"?)/gi)) out.push({ kind: "table", name: name(m[1]) });
  for (const m of s.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?("?[\w.]+"?)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?("?\w+"?)/gi)) out.push({ kind: "column", table: name(m[1]), name: name(m[2]) });
  for (const m of s.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?("?\w+"?)/gi)) out.push({ kind: "index", name: name(m[1]) });
  for (const m of s.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+("?\w+"?)/gi)) out.push({ kind: "trigger", name: name(m[1]) });
  return out;
}

async function exists(q, m) {
  if (m.kind === "table" || m.kind === "index") return !!(await q("SELECT to_regclass($1) AS r", [`public.${m.name}`])).rows[0].r;
  if (m.kind === "column") return (await q("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2", [m.table, m.name])).rows.length > 0;
  return (await q("SELECT 1 FROM pg_trigger WHERE tgname=$1 AND NOT tgisinternal", [m.name])).rows.length > 0;
}

/**
 * Highest migration whose objects all exist, when every later migration's objects are all absent.
 * Migrations that create nothing checkable (function-only) follow their neighbours. Returns
 * { tag } when unambiguous, otherwise { problem } describing what was found.
 */
export async function detectApplied(q, migrations) {
  const states = [];
  for (const m of migrations) {
    if (!m.markers.length) { states.push(null); continue; }
    const found = [];
    for (const x of m.markers) found.push(await exists(q, x)); // one connection: queries run one at a time
    states.push(found.every(Boolean) ? "applied" : found.some(Boolean) ? "partial" : "absent");
  }
  const partial = migrations.filter((_, i) => states[i] === "partial").map((m) => m.tag);
  if (partial.length) return { problem: `partly applied: ${partial.join(", ")}` };
  const lastApplied = states.lastIndexOf("applied");
  const firstAbsent = states.indexOf("absent");
  if (firstAbsent !== -1 && firstAbsent < lastApplied) return { problem: `${migrations[firstAbsent].tag} looks unapplied but ${migrations[lastApplied].tag} looks applied` };
  if (lastApplied === -1) return { tag: null };
  // Function-only migrations right after the last detected one cannot be told apart: stop at the detected one.
  return { tag: migrations[lastApplied].tag };
}

const TRACK = `CREATE TABLE IF NOT EXISTS calacot_migrations (tag text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(), note text)`;

/**
 * Plans (and with apply=true, performs) the update. q(sql, params) returns { rows }.
 * Returns { applied, pending, changed, baseline, problem }.
 */
export async function plan(q, migrations, { baseline } = {}) {
  const tracked = (await q("SELECT to_regclass('public.calacot_migrations') AS r")).rows[0].r
    ? (await q("SELECT tag, sha256 FROM calacot_migrations")).rows : [];
  let base = null;
  if (!tracked.length) {
    if (baseline) {
      if (!migrations.some((m) => m.tag === baseline)) return { problem: `unknown baseline tag ${baseline}` };
      base = baseline;
    } else {
      const d = await detectApplied(q, migrations);
      if (d.problem) return { problem: `Cannot tell which migrations are applied (${d.problem}). Run again with --baseline <last applied tag>.` };
      base = d.tag;
    }
  }
  const done = new Map(tracked.map((r) => [r.tag, r.sha256]));
  const baseIdx = base ? migrations.find((m) => m.tag === base).idx : -1;
  const applied = migrations.filter((m) => done.has(m.tag) || (!tracked.length && m.idx <= baseIdx));
  const pending = migrations.filter((m) => !applied.includes(m));
  const changed = migrations.filter((m) => done.has(m.tag) && done.get(m.tag) !== m.hash).map((m) => m.tag);
  const gap = pending.find((m) => applied.some((a) => a.idx > m.idx));
  if (gap) return { problem: `${gap.tag} is not applied but later migrations are. Apply it by hand or fix calacot_migrations.` };
  return { applied, pending, changed, baseline: tracked.length ? null : { tag: base, upTo: applied } };
}

/** Runs the plan in one transaction. commit=false rehearses and rolls back. */
export async function run(q, p, { commit }) {
  await q("BEGIN");
  try {
    await q(TRACK);
    for (const m of p.baseline?.upTo ?? []) await q("INSERT INTO calacot_migrations(tag,sha256,note) VALUES($1,$2,'baseline: already applied before db:apply') ON CONFLICT (tag) DO NOTHING", [m.tag, m.hash]);
    for (const m of p.pending) {
      for (const s of statements(m.sql)) {
        try { await q(s); } catch (e) { throw new Error(`${m.tag}: ${e.message}`); }
      }
      await q("INSERT INTO calacot_migrations(tag,sha256) VALUES($1,$2)", [m.tag, m.hash]);
    }
    await q(commit ? "COMMIT" : "ROLLBACK");
  } catch (e) { await q("ROLLBACK").catch(() => {}); throw e; }
}

// ---------------------------------------------------------------- CLI
function args(argv) {
  const a = { env: null, dryRun: false, status: false, yes: false, baseline: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--env") a.env = argv[++i];
    else if (argv[i] === "--dry-run") a.dryRun = true;
    else if (argv[i] === "--status") a.status = true;
    else if (argv[i] === "--yes" || argv[i] === "-y") a.yes = true;
    else if (argv[i] === "--baseline") a.baseline = argv[++i];
    else throw new Error(`Unknown option ${argv[i]}`);
  }
  return a;
}

async function main() {
  const a = args(process.argv.slice(2));
  const { config } = await import("dotenv");
  const env = {};
  config({ path: a.env ? [a.env] : [".env.local", ".env"], processEnv: env, quiet: true });
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!url) throw new Error(`No DATABASE_URL_UNPOOLED or DATABASE_URL in ${a.env ?? ".env.local/.env"}`);
  const host = new URL(url).host;
  const shown = host.replace(/^([^.]+)/, (h) => h.slice(0, 12) + "…");
  const migrations = await loadMigrations();
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(host) ? false : { rejectUnauthorized: true } });
  await client.connect();
  const q = (sql, params) => client.query(sql, params);
  try {
    const p = await plan(q, migrations, { baseline: a.baseline });
    if (p.problem) { console.error(`✖ ${p.problem}`); process.exitCode = 1; return; }
    console.log(`Database: ${shown}${a.env ? ` (from ${a.env})` : " (from .env.local)"}`);
    console.log(`Applied:  ${p.applied.length} of ${migrations.length}${p.applied.length ? ` (latest ${p.applied.at(-1).tag})` : ""}`);
    if (p.baseline) console.log(`First run: will record ${p.baseline.upTo.length} existing migrations as already applied (up to ${p.baseline.tag ?? "none"}), without re-running them.`);
    for (const t of p.changed) console.warn(`⚠ ${t} was edited after it was applied. Applied migrations should never change; create a new migration instead.`);
    if (!p.pending.length) { console.log("✔ Up to date. Nothing to apply."); if (p.baseline && !a.status && !a.dryRun) { await run(q, p, { commit: true }); console.log("✔ Recorded the baseline."); } return; }
    console.log(`Pending:  ${p.pending.map((m) => m.tag).join(", ")}`);
    if (a.status) return;
    process.stdout.write("Rehearsing (applied then rolled back)… ");
    await run(q, p, { commit: false });
    console.log("ok");
    if (a.dryRun) { console.log("✔ Dry run passed. Nothing was changed."); return; }
    // The Neon "development" branch endpoint. Anything else (production included) needs confirmation.
    const dev = host.startsWith("ep-still-recipe-zakbwwnc");
    if (!dev && !a.yes) {
      if (!process.stdin.isTTY) throw new Error("Not the dev database: rerun in a terminal to confirm, or pass --yes.");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`This is NOT the dev database. Take a Neon snapshot first.\nType the first part of the host (${host.split(".")[0]}) to apply: `);
      rl.close();
      if (answer.trim() !== host.split(".")[0]) { console.log("Cancelled. Nothing was changed."); return; }
    }
    await run(q, p, { commit: true });
    console.log(`✔ Applied ${p.pending.length} migration${p.pending.length === 1 ? "" : "s"}: ${p.pending.map((m) => m.tag).join(", ")}`);
  } finally { await client.end(); }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/db-apply.mjs")) {
  main().catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });
}
