import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { NextRequest, NextResponse } from "next/server.js";

await mkdir("tmp/org-routing", { recursive: true });
await build({
  entryPoints: {proxy: "proxy.ts", redirect: "app/auth/redirect/page.tsx"}, outdir: "tmp/org-routing", outExtension: {".js": ".cjs"},
  bundle: true, platform: "node", format: "cjs", packages: "external",
  plugins: [{name: "mock-clerk-session", setup(b) {
    b.onResolve({filter: /^@clerk\/nextjs\/server$/}, () => ({path: "clerk", namespace: "test-clerk"}));
    b.onLoad({filter: /.*/, namespace: "test-clerk"}, () => ({contents: "export function clerkMiddleware(handler, options) { globalThis.__organizationSync = options; return request => handler(async () => globalThis.__routingSession, request); } export async function auth(){return globalThis.__routingSession;} export async function clerkClient(){return globalThis.__routingClient;}"}));
    b.onResolve({filter: /^next\/navigation$/}, () => ({path: "navigation", namespace: "test-navigation"}));
    b.onLoad({filter: /.*/, namespace: "test-navigation"}, () => ({contents: "export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}"}));
  }}],
});
const require = createRequire(import.meta.url);
const proxy = require("../tmp/org-routing/proxy.cjs").default;
assert.deepEqual(globalThis.__organizationSync.organizationSyncOptions.organizationPatterns, ["/:slug/admin", "/:slug/admin/(.*)"]);
const session = {userId:"user_test", orgId:"org_test", orgSlug:"calacot", redirectToSignIn: () => NextResponse.redirect("https://example.test/sign-in")};
const request = (path, headers) => new NextRequest(`https://example.test${path}`, {headers});
globalThis.__routingSession = session;
assert.equal((await proxy(request("/"))).headers.get("location"), "https://example.test/calacot/admin");
assert.equal((await proxy(request("/admin/clients?page=2"))).headers.get("location"), "https://example.test/calacot/admin/clients?page=2");
assert.equal((await proxy(request("/calacot/admin"))).headers.get("x-middleware-rewrite"), "https://example.test/admin/dashboard");
assert.equal((await proxy(request("/calacot/admin/clients?page=2"))).headers.get("x-middleware-rewrite"), "https://example.test/admin/clients?page=2");
assert.equal((await proxy(request("/other/admin"))).status, 404);
assert.equal((await proxy(request("/api/sales/worker", {"x-calacot-org-slug":"spoofed"}))).headers.get("x-middleware-request-x-calacot-org-slug"), null);
globalThis.__routingSession = {...session, orgId:null, orgSlug:null};
assert.equal((await proxy(request("/admin/clients"))).headers.get("location"), "https://example.test/auth/redirect?returnTo=%2Fadmin%2Fclients");
assert.equal((await proxy(request("/calacot/admin"))).status, 404);
globalThis.__routingSession = {...session, userId:null, orgId:null, orgSlug:null};
assert.equal((await proxy(request("/calacot/admin"))).headers.get("location"), "https://example.test/sign-in");
assert.equal((await proxy(request("/"))).status, 200);
console.log("PASS: organization redirects, scoped rewrites, pagination preservation, invalid tenant denial, inactive sessions, signed-out redirects and spoofed-header removal.");
const landing = require("../tmp/org-routing/redirect.cjs").default;
globalThis.__routingSession = {...session, orgId:null, orgSlug:null};
let memberships = [];
globalThis.__routingClient = {users: {getOrganizationMembershipList: async params => {
  assert.equal(params.userId, session.userId);
  return {data: memberships};
}}};
await assert.rejects(landing({searchParams:Promise.resolve({})}), error => error.location === "/account/designs");
memberships = [{organization:{id:"org_test",slug:"calacot"}}];
await assert.rejects(landing({searchParams:Promise.resolve({})}), error => error.location === "/calacot/admin");
await assert.rejects(landing({searchParams:Promise.resolve({returnTo:"/admin/clients?page=2"})}), error => error.location === "/calacot/admin/clients?page=2");
await assert.rejects(landing({searchParams:Promise.resolve({returnTo:"https://other.test/"})}), error => error.location === "/calacot/admin");
const configured = process.env.CALACOT_CLERK_ORG_ID;
process.env.CALACOT_CLERK_ORG_ID = "org_calacot_test";
memberships.push({organization:{id:"org_calacot_test",slug:"calacot-staff"}});
await assert.rejects(landing({searchParams:Promise.resolve({})}), error => error.location === "/calacot-staff/admin");
if (configured === undefined) delete process.env.CALACOT_CLERK_ORG_ID; else process.env.CALACOT_CLERK_ORG_ID = configured;
console.log("PASS: membership lookup without an active organization, customer fallback, configured organization preference and external redirect rejection.");
