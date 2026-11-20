import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire, Module } from "node:module";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

const pg = new PGlite();
await pg.exec(`CREATE TABLE sales_rate_limits(key text PRIMARY KEY,count integer NOT NULL,expires_at timestamptz NOT NULL);
  CREATE TABLE verification_issuances(id uuid PRIMARY KEY,organization_id text,document_id uuid,reference_hash text,document_type text,document_number text,issuer_name text,issued_at timestamptz,pdf_sha256 text);
  CREATE TABLE verification_status_events(organization_id text,issuance_id uuid,sequence integer,status text);
  CREATE TABLE document_links(organization_id text,document_id uuid,invoice_id uuid,quotation_version_id uuid);
  CREATE TABLE invoices(id uuid,organization_id text,status text);
  CREATE TABLE quotation_versions(id uuid,organization_id text,status text,valid_until timestamptz);`);
globalThis.__verificationTestDb = drizzle(pg);
const bundle = await build({
  entryPoints: ["app/api/verify/route.ts"], bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
  plugins: [{ name: "db-fixture", setup(b) {
    b.onResolve({ filter: /^@\/database\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js", contents: `export const db=globalThis.__verificationTestDb;` }));
  } }],
});
const fixture = new Module(`${process.cwd()}/verification-route-fixture.cjs`);
fixture.filename = `${process.cwd()}/verification-route-fixture.cjs`;
fixture.require = createRequire(fixture.filename);
fixture._compile(bundle.outputFiles[0].text, fixture.filename);
const { POST } = fixture.exports;
process.env.CALACOT_VERIFICATION_ENABLED = "true";
process.env.CALACOT_VERIFICATION_TRUST_CLOUDFLARE = "true";
process.env.CALACOT_VERIFICATION_RATE_SECRET = "r".repeat(32);
const reference = Buffer.alloc(32, 5).toString("base64url");
const pdf = Buffer.from("%PDF-1.7 synthetic\n%%EOF");
const sha = (b) => createHash("sha256").update(b).digest("hex");
// The page hashes the PDF in the browser and sends only the digest; request bodies are refused.
const call = (file, token = reference, extra = {}) => POST(new Request("https://example.test/api/verify", { method: "POST", headers: { "cf-connecting-ip": "192.0.2.1", "x-verification-reference": token, ...(file ? { "x-verification-sha256": sha(file) } : {}), ...extra } }));
const digest = createHash("sha256").update(Buffer.alloc(32, 5)).digest("hex");
await pg.query(`INSERT INTO verification_issuances VALUES('10000000-0000-4000-8000-000000000001','a','20000000-0000-4000-8000-000000000001',$1,'invoice','I-1','Calacot',now(),$2)`, [digest, createHash("sha256").update(pdf).digest("hex")]);
await pg.exec(`INSERT INTO verification_status_events VALUES('a','10000000-0000-4000-8000-000000000001',1,'issued');
  INSERT INTO document_links VALUES('a','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',NULL);
  INSERT INTO invoices VALUES('30000000-0000-4000-8000-000000000001','a','issued');`);
let response = await call(pdf);
assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store, private, max-age=0");
assert.equal((await response.json()).integrity, "match");
response = await call(Buffer.from("altered")); assert.equal((await response.json()).integrity, "mismatch");
await pg.exec("UPDATE invoices SET status='void'");
response = await call(); assert.equal((await response.json()).status, "voided");
response = await call(undefined, Buffer.alloc(32, 6).toString("base64url")); assert.deepEqual(await response.json(), { found: false });
response = await call(undefined, "bad"); assert.deepEqual(await response.json(), { found: false });
await pg.exec("UPDATE sales_rate_limits SET count=31 WHERE key <> 'verification/global'"); response = await call(); assert.equal(response.status, 429);
await pg.exec("UPDATE sales_rate_limits SET count=1");
response = await call(undefined, reference, { "x-verification-sha256": "NOT-A-DIGEST" }); assert.equal(response.status, 400);
response = await POST(new Request("https://example.test/api/verify", { method: "POST", headers: { "cf-connecting-ip": "192.0.2.1", "x-verification-reference": reference }, body: pdf })); assert.equal(response.status, 413, "uploads are refused");
response = await call(Buffer.alloc(30 * 1024 * 1024, 1)); assert.equal((await response.json()).integrity, "mismatch", "large files are checked by digest");
delete process.env.CALACOT_VERIFICATION_TRUST_CLOUDFLARE; response = await call(); assert.equal(response.status, 503);
// Vercel mode trusts x-real-ip only when running on Vercel; a spoofed cf-connecting-ip is ignored.
process.env.CALACOT_VERIFICATION_TRUST_VERCEL = "true";
response = await call(); assert.equal(response.status, 503, "not on Vercel");
process.env.VERCEL = "1";
response = await call(undefined, reference, { "x-real-ip": "198.51.100.7" }); assert.equal(response.status, 200);
response = await call(); assert.equal(response.status, 503, "cf-connecting-ip is not trusted in Vercel mode");
await pg.close();
console.log("Public verification route checks passed with isolated PGlite database.");
