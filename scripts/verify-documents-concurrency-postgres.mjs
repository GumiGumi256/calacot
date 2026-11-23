// Phase 1F: document operations with two independent PostgreSQL connections whose transactions
// overlap. Usage: echo "<url>" | node scripts/verify-documents-concurrency-postgres.mjs
// Refuses any database not named phase1f_documents_fixture; migrates only an empty database.
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

let input = ""; for await (const chunk of process.stdin) input += chunk;
const url = new URL(input.trim());
if (url.pathname !== "/phase1f_documents_fixture") throw Error("Refusing non-fixture database");
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) throw Error("Refusing a non-local database: fixtures run on a throwaway local PostgreSQL");
const a = new Client({ connectionString: url.toString() }), b = new Client({ connectionString: url.toString() });
await a.connect(); await b.connect();
const settle = (p) => { const s = { done: false }; s.result = p.then((v) => { s.done = true; return v; }, (e) => { s.done = true; return e; }); return s; };
const pause = () => new Promise((r) => setTimeout(r, 700));
const passed = [];
try {
  if (!(await a.query("SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='family_id'")).rowCount) {
    if ((await a.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n) throw Error("Fixture not empty; refusing");
    const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
    await a.query("BEGIN");
    try { for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await a.query(s); await a.query("COMMIT"); } catch (e) { await a.query("ROLLBACK"); throw e; }
    passed.push(`migration chain 0000-${journal.entries.at(-1).tag} applied in one transaction`);
  }
  const org = "phase1f-" + randomUUID(), client = randomUUID();
  await a.query("INSERT INTO organizations(id,name,legal_name) VALUES($1,'F','F')", [org]);
  await a.query("INSERT INTO staff_memberships(organization_id,clerk_user_id,status) VALUES($1,'adm','active'),($1,'pm','active')", [org]);
  await a.query("INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES($1,$2,'company','C','tech')", [client, org]);
  const sha = (n) => String(n).padStart(64, "0");
  const mk = async (c, did, extra) => { const s = sha(Math.floor(Math.random() * 1e9)); return c.query("SELECT document_upload($1,'pm',$2::jsonb,'t') AS r", [org, JSON.stringify({ documentId: did, name: "doc.pdf", mimeType: "application/pdf", sizeBytes: 10, sha256: s, storageKey: `documents/${did}/${s}`, ...extra })]); };
  const root = randomUUID();
  await mk(a, root, { kind: "contract", linkType: "client", linkId: client });
  const overlap = async (name, first, second, check) => {
    await a.query("BEGIN"); await b.query("BEGIN");
    await first(a);
    const s = settle(second(b));
    await pause(); assert.equal(s.done, false, `${name}: second transaction must wait`);
    await a.query("COMMIT");
    const r = await s.result; await b.query(r instanceof Error ? "ROLLBACK" : "COMMIT");
    await check(r); passed.push(name);
  };
  await overlap("two revisions of the same version: second waits, then conflicts", (c) => mk(c, randomUUID(), { supersedesId: root }), (c) => mk(c, randomUUID(), { supersedesId: root }), async (r) => {
    assert.match(String(r), /document_revision_conflict/);
    assert.equal((await a.query("SELECT count(*)::int AS n FROM documents WHERE organization_id=$1 AND coalesce(family_id,id)=$2", [org, root])).rows[0].n, 2);
  });
  const v2 = (await a.query("SELECT id FROM documents WHERE organization_id=$1 AND supersedes_document_id=$2", [org, root])).rows[0].id;
  await overlap("archive racing a revision: the revision waits and is refused once archived", (c) => c.query("SELECT document_archive($1,'adm',$2,'Retired contract','t')", [org, root]), (c) => mk(c, randomUUID(), { supersedesId: v2 }), async (r) => {
    assert.match(String(r), /document_archived/);
    assert.equal((await a.query("SELECT count(*)::int AS n FROM documents WHERE organization_id=$1 AND coalesce(family_id,id)=$2 AND archived_at IS NOT NULL", [org, root])).rows[0].n, 2);
  });
  const root2 = randomUUID();
  await mk(a, root2, { kind: "contract", linkType: "client", linkId: client });
  await overlap("revision racing an archive: the archive waits and covers the new version too", (c) => mk(c, randomUUID(), { supersedesId: root2 }), (c) => c.query("SELECT document_archive($1,'adm',$2,'Retired contract','t') AS r", [org, root2]), async (r) => {
    assert(!(r instanceof Error), String(r));
    assert.equal((await a.query("SELECT count(*) FILTER (WHERE archived_at IS NULL)::int AS open,count(*)::int AS n FROM documents WHERE organization_id=$1 AND coalesce(family_id,id)=$2", [org, root2])).rows[0].open, 0, "no version left unarchived");
  });
  const same = randomUUID(), s1 = sha(123456789);
  const call = (c) => c.query("SELECT document_upload($1,'pm',$2::jsonb,'t') AS r", [org, JSON.stringify({ documentId: same, name: "same.pdf", mimeType: "application/pdf", sizeBytes: 10, sha256: s1, storageKey: `documents/${same}/${s1}`, kind: "report", linkType: "client", linkId: client })]);
  await overlap("same upload submitted twice concurrently: one document", call, call, async (r) => {
    assert(r instanceof Error ? /duplicate key|already/.test(String(r)) : true, String(r));
    assert.equal((await a.query("SELECT count(*)::int AS n FROM documents WHERE id=$1", [same])).rows[0].n, 1);
    assert.equal((await a.query("SELECT count(*)::int AS n FROM document_links WHERE document_id=$1", [same])).rows[0].n, 1);
  });
  // The commercial artifact registration (ON CONFLICT ... DO UPDATE with identical values) still works under the guard.
  await a.query("INSERT INTO documents(organization_id,name,kind,storage_key,mime_type,size_bytes,sha256) VALUES($1,'I.pdf','invoice','commercial/k','application/pdf',1,$2) ON CONFLICT(organization_id,storage_key) DO UPDATE SET storage_key=excluded.storage_key", [org, sha(1)]);
  await a.query("INSERT INTO documents(organization_id,name,kind,storage_key,mime_type,size_bytes,sha256) VALUES($1,'I.pdf','invoice','commercial/k','application/pdf',1,$2) ON CONFLICT(organization_id,storage_key) DO UPDATE SET storage_key=excluded.storage_key", [org, sha(1)]);
  passed.push("commercial artifact registration upsert unaffected by the immutability guard");
  console.log(`PASS on ${(await a.query("SELECT version()")).rows[0].version.split(" ").slice(0, 2).join(" ")} (${passed.length}):\n- ${passed.join("\n- ")}`);
} finally { await a.end(); await b.end(); }
