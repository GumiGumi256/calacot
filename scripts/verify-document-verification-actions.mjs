import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire, Module } from "node:module";
import { build } from "esbuild";

const pdf = Buffer.from("%PDF-1.7 fixture\n%%EOF");
const state = globalThis.__verificationActionFixture = { allowed: false, calls: 0, pdf, sha: createHash("sha256").update(pdf).digest("hex") };
const bundle = await build({ entryPoints: ["lib/documents/verification-actions.ts"], bundle: true, platform: "node", format: "cjs", write: false, packages: "external", plugins: [{ name: "fixture", setup(b) {
  b.onResolve({ filter: /^(server-only|next\/headers|@\/database\/db|@\/lib\/admin\/clerk-auth|@\/lib\/sales\/storage)$/ }, ({ path }) => ({ path, namespace: "fixture" }));
  b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => {
    if (path === "server-only") return { loader: "js", contents: "" };
    if (path === "next/headers") return { loader: "js", contents: `export async function headers(){return new Headers({origin:'https://example.test',host:'example.test'})}` };
    if (path.endsWith("clerk-auth")) return { loader: "js", contents: `export async function liveStaffContext(permission){const s=globalThis.__verificationActionFixture;if(!s.allowed||permission!=='verification_issue')throw Error('denied');return {organizationId:'a',actor:'staff',role:'org:admin',permissions:['verification_issue','invoices_read']}}` };
    if (path.endsWith("storage")) return { loader: "js", contents: `export async function loadPdf(){return globalThis.__verificationActionFixture.pdf}` };
    return { loader: "js", contents: `export const db={async execute(){const s=globalThis.__verificationActionFixture;s.calls++;return {rows:s.calls%3===1?[{storage_key:'commercial/a',sha256:s.sha,kind:'invoice',size_bytes:'20'}]:s.calls%3===2?[{count:1}]:[]}}}` };
  });
} }] });
const mod = new Module(`${process.cwd()}/verification-actions-fixture.cjs`);
mod.filename = `${process.cwd()}/verification-actions-fixture.cjs`; mod.require = createRequire(mod.filename); mod._compile(bundle.outputFiles[0].text, mod.filename);
const { registerLegacyVerification } = mod.exports;
process.env.CALACOT_VERIFICATION_ENABLED = "true"; process.env.CALACOT_VERIFICATION_REFERENCE_SECRET = "r".repeat(32);
const input = { documentId: "00000000-0000-4000-8000-000000000001", evidence: "Reviewed original issuance evidence" };
await assert.rejects(registerLegacyVerification(input), /denied/); assert.equal(state.calls, 0);
state.allowed = true; state.pdf = Buffer.from("altered");
assert.equal((await registerLegacyVerification(input)).ok, false);
state.calls = 0; state.pdf = pdf;
const first = await registerLegacyVerification(input); assert.equal(first.ok, true);
state.calls = 0; const retry = await registerLegacyVerification(input); assert.equal(retry.reference, first.reference);
state.allowed = false; await assert.rejects(registerLegacyVerification(input), /denied/);
console.log("Legacy registration action checks passed with mocked Clerk and storage.");
