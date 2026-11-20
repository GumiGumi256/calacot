import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire, Module } from "node:module";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { PDFDocument } from "pdf-lib";

// Embedded issuance end to end: the real renderer and finalArtifact, the full migration chain in an
// in-memory PGlite database, and in-memory create-only storage. No environment or network access.
const pg = new PGlite();
const journal = JSON.parse(await readFile(new URL("../drizzle-current/meta/_journal.json", import.meta.url), "utf8"));
for (const entry of journal.entries) {
  const migration = await readFile(new URL(`../drizzle-current/${entry.tag}.sql`, import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) await pg.exec(statement);
}
const org = "org_a", inv = "30000000-0000-4000-8000-000000000001", invNoAudit = "30000000-0000-4000-8000-000000000002", legacyInv = "30000000-0000-4000-8000-000000000003";
await pg.exec(`INSERT INTO organizations(id,name,legal_name) VALUES ('${org}','Calacot','Calacot Ltd');
  INSERT INTO clients(id,organization_id,kind,display_name) VALUES('20000000-0000-4000-8000-000000000001','${org}','company','Synthetic Client');
  INSERT INTO invoices(id,organization_id,client_id,number,status,customer_snapshot,issuer_snapshot,document_snapshot,subtotal,total,issued_at) VALUES
    ('${inv}','${org}','20000000-0000-4000-8000-000000000001','INV-0001','issued','{}','{}','{"number":"INV-0001","issuer":{"legalName":"Calacot Ltd"}}',100,100,now()),
    ('${invNoAudit}','${org}','20000000-0000-4000-8000-000000000001','INV-0002','issued','{}','{}','{"number":"INV-0002","issuer":{"legalName":"Calacot Ltd"}}',100,100,now()),
    ('${legacyInv}','${org}','20000000-0000-4000-8000-000000000001','INV-0003','issued','{}','{}','{"number":"INV-0003","issuer":{"legalName":"Calacot Ltd"}}',100,100,now());
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) VALUES
    ('${org}','user_finance','staff','invoice.issue','invoice','${inv}','{}','fixture'),
    ('${org}','user_finance','staff','invoice.issue','invoice','${legacyInv}','{}','fixture');`);

const store = new Map();
const state = globalThis.__artifactFixture = { db: drizzle(pg), store, failAfterStore: false, puts: 0 };
const bundle = await build({
  entryPoints: ["lib/sales/artifacts.ts"], bundle: true, platform: "node", format: "cjs", write: false, packages: "external", jsx: "automatic",
  plugins: [{ name: "fixture", setup(b) {
    b.onResolve({ filter: /^(server-only|@\/database\/db|\.\/storage)$/ }, ({ path }) => ({ path, namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => {
      if (path === "server-only") return { loader: "js", contents: "" };
      if (path === "@/database/db") return { loader: "js", contents: "export const db=globalThis.__artifactFixture.db;" };
      return { loader: "js", contents: `const s=globalThis.__artifactFixture;
        export async function storePdf(key,bytes){s.puts++;if(s.store.has(key))return "exists";s.store.set(key,Buffer.from(bytes));if(s.failAfterStore){s.failAfterStore=false;throw new Error("simulated_crash");}return "created";}
        export async function loadPdf(key){const v=s.store.get(key);if(!v)throw new Error("artifact_missing");return Buffer.from(v);}` };
    });
  } }],
});
const mod = new Module(`${process.cwd()}/verification-artifacts-fixture.cjs`);
mod.filename = `${process.cwd()}/verification-artifacts-fixture.cjs`; mod.require = createRequire(mod.filename); mod._compile(bundle.outputFiles[0].text, mod.filename);
const { finalArtifact } = mod.exports;

const logo = (await readFile("public/calacot-logo.png")).toString("base64");
const snapshot = (number) => ({ type: "invoice", number, version: 1, title: "Office fit-out", project: "HQ", clientId: "c", projectId: "p", quotationVersionId: "q", currency: "UGX",
  customer: { name: "Synthetic Client", address: "Kampala", taxIdentifier: "", email: "client@example.test" },
  issuer: { legalName: "Calacot Ltd", address: "Kampala", email: "hello@example.test", phone: "", taxIdentifier: "" },
  scope: "Synthetic scope", deliverables: [], exclusions: [], terms: "Net 14", instructions: "",
  items: [{ position: 0, description: "Works", unit: "lot", quantity: "1", unitPrice: "100.00", discountAmount: "0.00", taxRate: "0", subtotal: "100.00", taxAmount: "0.00", total: "100.00" }],
  subtotal: "100.00", discountAmount: "0.00", taxAmount: "0.00", total: "100.00", issuedAt: "2026-11-01T09:00:00.000Z", due: "2026-11-15", billingPolicy: "full", billingPurpose: "initial",
  schedules: [{ label: "Full payment", amount: "100.00", dueAt: "" }], brand: { logoBase64: logo } });
const sha = (b) => createHash("sha256").update(b).digest("hex");
const issuance = async (docId) => (await pg.query("SELECT v.reference_hash,v.pdf_sha256,v.registration_kind FROM verification_issuances v WHERE v.document_id=$1", [docId])).rows[0];

// 1. Embedding off: unchanged v1 behaviour, no verification record.
process.env.SALES_NOTIFICATION_MODE = "capture";
const legacy = await finalArtifact(org, "invoice", legacyInv, snapshot("INV-0003"));
assert.equal(await issuance(legacy.id), undefined);
assert.ok([...store.keys()].some((k) => k.endsWith(`/invoice/${legacyInv}/calacot-commercial-v1.pdf`)));

// 2. Embedding on. An existing v1 artifact is reused unchanged, never regenerated.
process.env.CALACOT_VERIFICATION_ENABLED = "true"; process.env.CALACOT_VERIFICATION_EMBED = "true";
process.env.CALACOT_VERIFICATION_REFERENCE_SECRET = "s".repeat(32); process.env.CALACOT_APP_URL = "https://calacot.example";
const legacyAgain = await finalArtifact(org, "invoice", legacyInv, snapshot("INV-0003"));
assert.equal(legacyAgain.id, legacy.id); assert.equal(sha(legacyAgain.bytes), sha(legacy.bytes));

// 3. No issuance audit: no authority, so no QR and no record (v1 fallback).
const noAudit = await finalArtifact(org, "invoice", invNoAudit, snapshot("INV-0002"));
assert.equal(await issuance(noAudit.id), undefined);

// 4. Crash after the create-only write, before finalization: the retry recovers the stored object.
state.failAfterStore = true;
await assert.rejects(finalArtifact(org, "invoice", inv, snapshot("INV-0001")), /simulated_crash/);
const storedKey = [...store.keys()].find((k) => k.includes(`/invoice/${inv}/calacot-commercial-v2-`));
assert.ok(storedKey, "embedded artifact stored under a v2 key");
const storedBytes = store.get(storedKey);
assert.equal((await pg.query("SELECT count(*)::int AS n FROM verification_issuances")).rows[0].n, 0, "nothing published before finalization");
const putsBefore = state.puts;
// Concurrent retries agree on the single stored object.
const [a, b] = await Promise.all([finalArtifact(org, "invoice", inv, snapshot("INV-0001")), finalArtifact(org, "invoice", inv, snapshot("INV-0001"))]);
assert.equal(state.puts, putsBefore, "recovery never rewrites the stored object");
assert.equal(a.id, b.id); assert.equal(sha(a.bytes), sha(storedBytes)); assert.equal(sha(b.bytes), sha(storedBytes));
const record = await issuance(a.id);
assert.equal(record.registration_kind, "embedded");
assert.equal(record.pdf_sha256, sha(storedBytes), "digest covers the final bytes including the QR");
assert.equal(storedKey.slice(-20, -4), record.reference_hash.slice(0, 16));

// 5. The PDF carries the reference whose digest is recorded, and the QR/link to the canonical origin.
const pdf = await PDFDocument.load(storedBytes);
const reference = /calacot-verification:([A-Za-z0-9_-]{43})/.exec(pdf.getKeywords() ?? "")?.[1];
assert.ok(reference, "reference embedded");
assert.equal(sha(Buffer.from(reference, "base64url")), record.reference_hash);
assert.ok(pdf.getPages()[0].node.Resources().toString().includes("XObject"), "QR image embedded");
assert.equal((await finalArtifact(org, "invoice", inv, snapshot("INV-0001"))).id, a.id, "later calls reuse the record");

// 6. A tampered stored object is detected, never silently served.
store.set(storedKey, Buffer.concat([storedBytes, Buffer.from("\n%tampered")]));
await assert.rejects(finalArtifact(org, "invoice", inv, snapshot("INV-0001")), /artifact_checksum_mismatch/);

// 6b. Two fresh issuances racing: both render, one create-only write wins, both publish the winner's bytes.
const raced = "30000000-0000-4000-8000-000000000005";
await pg.exec(`INSERT INTO invoices(id,organization_id,client_id,number,status,customer_snapshot,issuer_snapshot,document_snapshot,subtotal,total,issued_at) VALUES ('${raced}','${org}','20000000-0000-4000-8000-000000000001','INV-0005','issued','{}','{}','{"number":"INV-0005","issuer":{"legalName":"Calacot Ltd"}}',100,100,now());
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) VALUES ('${org}','user_finance','staff','invoice.issue','invoice','${raced}','{}','fixture');`);
const [r1, r2] = await Promise.all([finalArtifact(org, "invoice", raced, snapshot("INV-0005")), finalArtifact(org, "invoice", raced, snapshot("INV-0005"))]);
assert.equal(r1.id, r2.id); assert.equal(sha(r1.bytes), sha(r2.bytes));
assert.equal((await issuance(r1.id)).pdf_sha256, sha(r1.bytes));
assert.equal((await pg.query("SELECT count(*)::int AS n FROM document_links WHERE invoice_id=$1", [raced])).rows[0].n, 1);

// 7. Misconfiguration fails closed when embedding is enabled.
process.env.CALACOT_APP_URL = "http://calacot.example"; process.env.SALES_NOTIFICATION_MODE = "live";
const other = "30000000-0000-4000-8000-000000000004";
await pg.exec(`INSERT INTO invoices(id,organization_id,client_id,number,status,customer_snapshot,issuer_snapshot,document_snapshot,subtotal,total,issued_at) VALUES ('${other}','${org}','20000000-0000-4000-8000-000000000001','INV-0004','issued','{}','{}','{"number":"INV-0004","issuer":{"legalName":"Calacot Ltd"}}',100,100,now());
  INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) VALUES ('${org}','user_finance','staff','invoice.issue','invoice','${other}','{}','fixture');`);
await assert.rejects(finalArtifact(org, "invoice", other, snapshot("INV-0004")), /verification_configuration/);

if (process.argv.includes("--write")) { await mkdir("tmp/pdfs", { recursive: true }); await writeFile("tmp/pdfs/verification-embedded.pdf", storedBytes); }
await pg.close();
console.log("Embedded verification issuance checks passed (render, create-only storage, crash recovery, concurrency).");
