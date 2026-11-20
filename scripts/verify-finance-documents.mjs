// Phase 1D: receipt/evidence upload and download route handlers against a disposable
// migrated PGlite database. Storage and Clerk are mocked; route and SQL code are real.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

const pg = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) for (const s of (await readFile(`drizzle-current/${entry.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A'),('b','B','B');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,status) VALUES('${id(1)}','a','req','active'),('${id(2)}','a','rev','active'),('${id(3)}','a','fin','active'),('${id(4)}','a','peer','active'),('${id(5)}','b','req','active');
    INSERT INTO expenses(id,organization_id,division,category,description,purpose,net_amount,total,currency,status,incurred_at,requested_by_id,idempotency_key)
      VALUES('${id(10)}','a','tech','Software','Licence','Annual licence',100,100,'UGX','draft',now(),'${id(1)}','k1'),
            ('${id(11)}','a','tech','Software','Licence 2','Annual licence',100,100,'UGX','submitted',now(),'${id(1)}','k2');`);
  const stored = new Map();
  const c = (globalThis.__docTest = { db: drizzle(pg), org: "a", actor: "req", permissions: ["expenses_create"], stored });
  const bundle = await build({
    stdin: { contents: `export { POST } from "./app/api/finance/expenses/[id]/documents/route"; export { GET } from "./app/api/finance/documents/[id]/route";`, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{ name: "isolated", setup(b) {
      b.onResolve({ filter: /^(server-only|next\/cache|next\/headers|next\/navigation|@\/database\/db|@\/lib\/sales\/permissions|@\/lib\/sales\/storage|@clerk\/nextjs\/server)$/ }, ({ path }) => ({ path, namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => {
        const g = "const c=globalThis.__docTest;";
        if (path === "server-only") return { loader: "js", contents: "" };
        if (path === "next/cache") return { loader: "js", contents: "export function revalidatePath(){} export function revalidateTag(){} export function updateTag(){} export function cacheTag(){} export function cacheLife(){}" };
        if (path === "next/headers") return { loader: "js", contents: "export async function headers(){return new Headers()}" };
        if (path === "next/navigation") return { loader: "js", contents: "export function notFound(){throw new Error('NEXT_NOT_FOUND')}" };
        if (path === "@clerk/nextjs/server") return { loader: "js", contents: "export async function currentUser(){return null} export async function clerkClient(){throw new Error('unused')}" };
        if (path.endsWith("storage")) return { loader: "js", contents: g + "export async function storePrivateObject(k,b,t){if(c.stored.has(k))throw new Error('overwrite');c.stored.set(k,{b,t})} export async function loadPrivateObject(k){const o=c.stored.get(k);if(!o)throw new Error('missing');return o.b}" };
        if (path.includes("permissions")) return { loader: "js", contents: g + "export const permissions=[]; export const sensitivePermissions=new Set(); export function invalidateLiveMembership(){} export function roleAllows(){return false} export async function staffContext(r){if(!c.permissions.length||(r&&!c.permissions.includes(r)))throw new Error('NEXT_NOT_FOUND');return {organizationId:c.org,actor:c.actor,role:'org:member',permissions:[...c.permissions]}}" };
        return { loader: "js", contents: g + "export const db={execute(q){return c.db.execute(q)}}" };
      });
    } }],
  });
  await mkdir("tmp", { recursive: true });
  const file = resolve("tmp/phase1d-documents.cjs");
  await writeFile(file, bundle.outputFiles[0].contents);
  const { POST, GET } = createRequire(import.meta.url)(file);
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(100, 32)]);
  const upload = (expense, bytes, role = "requester", origin = "http://app.test", documentId = crypto.randomUUID()) => {
    const body = new FormData();
    body.set("file", new File([bytes], "receipt.pdf", { type: "application/pdf" }));
    body.set("role", role); body.set("documentId", documentId);
    return POST(new Request(`http://app.test/api/finance/expenses/${expense}/documents`, { method: "POST", body, headers: { host: "app.test", ...(origin ? { origin } : {}) } }), { params: Promise.resolve({ id: expense }) });
  };
  assert.equal((await upload(id(10), pdf, "requester", "http://evil.test")).status, 403, "cross-origin upload rejected");
  assert.equal((await upload(id(10), Buffer.from("<html>not a pdf</html>"))).status, 400, "content sniffing rejects disguised file");
  const ok = await upload(id(10), pdf);
  assert.equal(ok.status, 200, await ok.clone().text());
  const docId = (await ok.json()).id;
  assert.equal(stored.size, 1);
  assert.deepEqual((await pg.query("SELECT kind,mime_type,size_bytes::int AS size,length(sha256)::int AS h FROM documents WHERE id=$1", [docId])).rows, [{ kind: "expense_receipt", mime_type: "application/pdf", size: pdf.length, h: 64 }]);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM expense_events WHERE action='document_attached'")).rows[0].n, 1);
  assert.equal((await upload(id(11), pdf)).status, 409, "submitted request is locked for requester uploads");
  assert.equal(stored.size, 1, "nothing stored when ineligible");
  c.actor = "peer";
  assert.equal((await upload(id(10), pdf)).status, 409, "another employee cannot attach to someone else's draft");
  c.permissions = ["expenses_create"]; c.actor = "fin";
  assert.equal((await upload(id(10), pdf, "finance")).status, 404, "finance role needs expenses_disburse");
  c.org = "b"; c.actor = "req";
  assert.equal((await upload(id(10), pdf)).status, 409, "cross-organization upload rejected");
  const get = (doc) => GET(new Request(`http://app.test/api/finance/documents/${doc}`), { params: Promise.resolve({ id: doc }) });
  assert.equal((await get(docId)).status, 404, "cross-organization download rejected");
  c.org = "a"; c.actor = "req"; c.permissions = ["expenses_create"];
  const own = await get(docId);
  assert.equal(own.status, 200); assert.equal(own.headers.get("cache-control"), "private, no-store"); assert.equal(own.headers.get("x-content-type-options"), "nosniff");
  c.actor = "peer";
  assert.equal((await get(docId)).status, 404, "non-requester without expenses_read denied");
  c.permissions = ["expenses_read"];
  assert.equal((await get(docId)).status, 200, "expenses_read may download");
  console.log("PASS: evidence upload/download authorization, origin check, content sniffing, eligibility, organization isolation and private headers.");
} finally {
  await pg.close();
  delete globalThis.__docTest;
}
