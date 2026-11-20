// Phase 1E: the Clerk webhook route with the REAL @clerk/nextjs/webhooks verifyWebhook
// (Standard Webhooks / Svix signatures). Only the database and the Clerk Backend API are
// replaced (PGlite, fake membership list). Payloads are signed with a throwaway secret.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Webhook } from "standardwebhooks";

const secret = `whsec_${randomBytes(24).toString("base64")}`;
process.env.CLERK_WEBHOOK_SIGNING_SECRET = secret;
process.env.CALACOT_CLERK_ORG_ID = "a";
const pg = new PGlite();
try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec("INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A')");
  const members = new Map([["user_new", "org:sales"]]);
  globalThis.__hook = { db: drizzle(pg), members };
  const bundle = await build({
    entryPoints: ["app/api/webhooks/clerk/route.ts"], bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{ name: "isolated", setup(b) {
      b.onResolve({ filter: /^(server-only|@\/database\/db|@clerk\/nextjs\/server|@\/lib\/sales\/permissions)$/ }, ({ path }) => ({ path, namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => {
        const g = "const c=globalThis.__hook;";
        if (path === "server-only") return { loader: "js", contents: "" };
        if (path.includes("permissions")) return { loader: "js", contents: "export function invalidateLiveMembership(){}" };
        if (path === "@clerk/nextjs/server") return { loader: "js", contents: g + "export async function clerkClient(){return {organizations:{async getOrganizationMembershipList({userId}){const data=userId.filter(u=>c.members.has(u)).map(u=>({organization:{id:'a'},role:c.members.get(u),publicUserData:{userId:u,firstName:'N',lastName:null,identifier:u+'@example.test'}}));return {data,totalCount:data.length}}}}}" };
        return { loader: "js", contents: g + "export const db={execute(q){return c.db.execute(q)}}" };
      });
    } }],
  });
  await mkdir("tmp", { recursive: true });
  const file = resolve("tmp/phase1e-webhook-signature.cjs");
  await writeFile(file, bundle.outputFiles[0].contents);
  const { POST } = createRequire(import.meta.url)(file);
  const payload = (type, user) => JSON.stringify({ type, object: "event", data: { organization: { id: "a" }, public_user_data: { user_id: user } } });
  const send = async (id, body, { signWith = secret, timestamp = new Date(), tamper = false } = {}) => {
    const signature = new Webhook(signWith).sign(id, timestamp, body);
    const { NextRequest } = await import("next/server.js");
    return POST(new NextRequest("http://app.test/api/webhooks/clerk", { method: "POST", body: tamper ? body.replace("org:", "org:x") + " " : body, headers: { "svix-id": id, "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)), "svix-signature": signature, "content-type": "application/json" } }));
  };
  const body = payload("organizationMembership.created", "user_new");
  assert.equal((await send("msg_valid", body)).status, 200, "valid signature accepted");
  assert.equal((await pg.query("SELECT clerk_role FROM staff_memberships WHERE clerk_user_id='user_new'")).rows[0].clerk_role, "org:sales");
  assert.equal(await (await send("msg_valid", body)).text(), "Duplicate delivery", "replayed delivery id acknowledged without reprocessing");
  assert.equal((await send("msg_tampered", body, { tamper: true })).status, 400, "tampered body rejected");
  assert.equal((await send("msg_wrong", body, { signWith: `whsec_${randomBytes(24).toString("base64")}` })).status, 400, "wrong secret rejected");
  assert.equal((await send("msg_old", body, { timestamp: new Date(Date.now() - 60 * 60 * 1000) })).status, 400, "stale timestamp (replay window) rejected");
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM clerk_webhook_events")).rows[0].n, 1, "rejected deliveries are not recorded");
  delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  assert.equal((await send("msg_unconfigured", body)).status, 503, "endpoint disabled without a signing secret");
  console.log("PASS: real Clerk/Svix signature verification (valid, tampered, wrong secret, stale timestamp, unconfigured) and idempotent delivery handling.");
} finally {
  await pg.close();
  delete globalThis.__hook;
}
