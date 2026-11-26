// npm run db:apply logic (scripts/db-apply.mjs) against disposable PGlite databases.
// No environment variables, no network, no real database.
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { loadMigrations, plan, run } from "./db-apply.mjs";

const migrations = await loadMigrations();
const upTo = (tag) => migrations.slice(0, migrations.findIndex((m) => m.tag === tag) + 1);
const fresh = async (tag) => {
  const pg = new PGlite();
  for (const m of tag ? upTo(tag) : []) for (const s of m.sql.split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  return { pg, q: (sql, params) => pg.query(sql, params) };
};
const mid = migrations.find((m) => m.tag.startsWith("0026_")).tag;

// 1. Existing database applied by hand up to 0026: detected, nothing re-run, the rest applied.
{
  const { pg, q } = await fresh(mid);
  const p = await plan(q, migrations);
  assert.equal(p.problem, undefined, p.problem);
  assert.equal(p.baseline.tag, mid, "detects the last applied migration");
  assert.deepEqual(p.pending.map((m) => m.tag), migrations.filter((m) => m.idx > upTo(mid).at(-1).idx).map((m) => m.tag));
  // Rehearsal changes nothing.
  await run(q, p, { commit: false });
  assert.equal((await q("SELECT to_regclass('public.calacot_migrations') r")).rows[0].r, null, "dry run leaves no trace");
  assert.equal((await q("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='expenses' AND column_name='entry_mode'")).rows[0].n, 0);
  // Real run applies and records everything.
  await run(q, p, { commit: true });
  assert.equal((await q("SELECT count(*)::int n FROM calacot_migrations")).rows[0].n, migrations.length);
  assert.equal((await q("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='expenses' AND column_name='entry_mode'")).rows[0].n, 1);
  // Second run: nothing to do.
  const again = await plan(q, migrations);
  assert.equal(again.pending.length, 0);
  assert.equal(again.baseline, null);
  // An applied file edited afterwards is reported.
  const edited = migrations.map((m) => (m.tag === mid ? { ...m, hash: "x" } : m));
  assert.deepEqual((await plan(q, edited)).changed, [mid]);
  await pg.close();
}

// 2. Empty database: everything pending, applied in one go.
{
  const { pg, q } = await fresh(null);
  const p = await plan(q, migrations);
  assert.equal(p.baseline.tag, null);
  assert.equal(p.pending.length, migrations.length);
  await run(q, p, { commit: true });
  assert.equal((await plan(q, migrations)).pending.length, 0);
  await pg.close();
}

// 3. A failing migration rolls everything back, including the tracking rows.
{
  const { pg, q } = await fresh(mid);
  const p = await plan(q, migrations);
  const broken = { ...p, pending: [...p.pending.slice(0, 1), { tag: "9999_broken", hash: "h", sql: "SELECT 1/0" }] };
  await assert.rejects(run(q, broken, { commit: true }), /9999_broken/);
  assert.equal((await q("SELECT to_regclass('public.calacot_migrations') r")).rows[0].r, null);
  assert.equal((await q("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='expenses' AND column_name='entry_mode'")).rows[0].n, 0, "the good migration before it was rolled back too");
  await pg.close();
}

// 4. Ambiguous state is refused unless a baseline is named.
{
  const { pg, q } = await fresh(mid);
  await q("ALTER TABLE project_members ADD COLUMN agreed_amount numeric(17,2)"); // half of 0027 by hand
  assert.match((await plan(q, migrations)).problem, /--baseline/);
  const named = await plan(q, migrations, { baseline: mid });
  assert.equal(named.baseline.tag, mid);
  await pg.close();
}

console.log("PASS: db:apply detects how far an existing database is, rehearses without changing anything, applies pending migrations in one transaction, records them, reports edited migrations and refuses ambiguous states.");
