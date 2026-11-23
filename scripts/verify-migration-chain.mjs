// Migration chain consistency. Reads files only, plus an in-memory PGlite apply. No environment
// variables, no network, no real database.
//   1. Journal: contiguous idx from 0, unique tags, increasing timestamps, a .sql file per entry,
//      and no .sql file outside the journal.
//   2. History: the committed journal (git HEAD) is an unchanged prefix of the working journal, and
//      every committed migration file is byte-identical (applied migrations are never edited).
//   3. Additivity (0018+): no DROP / TRUNCATE / DELETE FROM / ALTER ... DROP / RENAME statements.
//   4. Redefinitions: lists functions a migration re-creates that an EARLIER migration defined.
//   5. The whole chain applies to an empty database.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";

const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
const entries = journal.entries;
const report = { entries: entries.length, last: entries.at(-1).tag, redefinitions: {}, additive: {}, unchangedCommitted: 0 };

entries.forEach((e, i) => assert.equal(e.idx, i, `journal idx ${e.idx} at position ${i}`));
assert.equal(new Set(entries.map((e) => e.tag)).size, entries.length, "duplicate tags");
for (let i = 1; i < entries.length; i++) assert.ok(entries[i].when > entries[i - 1].when, `timestamps must increase at ${entries[i].tag}`);
const files = (await readdir("drizzle-current")).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, ""));
for (const e of entries) assert.ok(files.includes(e.tag), `missing file for ${e.tag}`);
const orphans = files.filter((f) => !entries.some((e) => e.tag === f));
assert.deepEqual(orphans, [], `SQL files not in the journal: ${orphans.join(", ")}`);
for (const e of entries) assert.ok(e.tag.startsWith(String(e.idx).padStart(4, "0") + "_"), `tag ${e.tag} does not match idx ${e.idx}`);

// Committed history must be untouched.
const git = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
let committed = [];
try { committed = JSON.parse(git(["show", "HEAD:drizzle-current/meta/_journal.json"])).entries; } catch { committed = []; }
committed.forEach((c, i) => assert.deepEqual(entries[i], c, `committed journal entry ${c.tag} changed`));
const norm = (s) => s.replace(/\r\n/g, "\n");
for (const c of committed) {
  const head = git(["show", `HEAD:drizzle-current/${c.tag}.sql`]);
  assert.equal(norm(await readFile(`drizzle-current/${c.tag}.sql`, "utf8")), norm(head), `committed migration ${c.tag} was edited`);
  report.unchangedCommitted++;
}

// Additivity and redefinitions.
const defined = new Map();
const fnRe = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+([a-z_][a-z0-9_]*)\s*\(/gi;
const destructive = /^\s*(DROP\s+(TABLE|COLUMN|INDEX|FUNCTION|TRIGGER|TYPE|VIEW|SCHEMA)|TRUNCATE\b|DELETE\s+FROM\b|ALTER\s+TABLE\s+[^;]*\b(DROP|RENAME)\b)/gim;
for (const e of entries) {
  const sql = (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).replace(/\$\$[\s\S]*?\$\$/g, "$$$$").replace(/--[^\n]*/g, "");
  const full = await readFile(`drizzle-current/${e.tag}.sql`, "utf8");
  const redefined = [];
  for (const m of full.matchAll(fnRe)) {
    const name = m[1].toLowerCase();
    if (defined.has(name) && defined.get(name) !== e.tag) redefined.push(`${name} (from ${defined.get(name)})`);
    defined.set(name, defined.get(name) ?? e.tag);
  }
  if (e.idx >= 18) {
    // A DROP of a constraint or trigger that the same migration immediately re-creates under the same
    // name (widening a CHECK, idempotent trigger creation) is a replacement, not a removal: report it.
    const lines = sql.split("\n");
    const bad = [], replaced = [];
    for (const m of sql.matchAll(destructive)) {
      const stmt = lines.find((l) => l.includes(m[0].trim())) ?? m[0];
      const name = (stmt.match(/DROP\s+(?:CONSTRAINT|TRIGGER)\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/i) ?? [])[1];
      const recreated = name && new RegExp(`(ADD\\s+CONSTRAINT|CREATE\\s+TRIGGER)\\s+${name}\\b`, "i").test(sql.slice(sql.indexOf(stmt) + stmt.length));
      (recreated ? replaced : bad).push(stmt.trim().slice(0, 90));
    }
    report.additive[e.tag] = bad.length ? bad : replaced.length ? `additive (replaced in place: ${replaced.join("; ")})` : "additive";
    if (redefined.length) report.redefinitions[e.tag] = [...new Set(redefined)];
  }
}
const nonAdditive = Object.entries(report.additive).filter(([, v]) => typeof v !== "string");
assert.deepEqual(nonAdditive, [], `destructive statements in accounting migrations: ${JSON.stringify(nonAdditive)}`);

// Applies cleanly.
const pg = new PGlite();
for (const e of entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
report.tables = (await pg.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].n;
await pg.close();
report.committedEntries = committed.length;
console.log(JSON.stringify(report, null, 2));
console.log(`PASS: ${entries.length} migrations consistent; ${committed.length} committed migrations unchanged; 0018+ additive; chain applies (${report.tables} tables).`);
