import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { invokeCareWorker } from "../deployment/customer-care-scheduler/worker.mjs";

const worker = "w".repeat(32), cron = "c".repeat(32);
const env = { CUSTOMER_CARE_WORKER_SECRET: worker, CUSTOMER_CARE_WORKER_URL: "https://www.calacot.com/api/customer-care/worker" };
let calls = 0;
await invokeCareWorker(env, async (url, options) => {
  calls++;
  assert.equal(url.href, env.CUSTOMER_CARE_WORKER_URL);
  assert.equal(options.method, "POST");
  assert.equal(options.redirect, "error");
  assert.equal(options.headers.authorization, `Bearer ${worker}`);
  return Response.json({ processed: 2 });
});
await assert.rejects(invokeCareWorker({ ...env, CUSTOMER_CARE_WORKER_URL: "https://other.test/" }), /configuration_invalid/);
await assert.rejects(invokeCareWorker(env, async () => new Response(null, { status: 401 })), /http_401/);
await assert.rejects(invokeCareWorker(env, async () => Response.json({ disabled: true })), /disabled/);
assert.equal(calls, 1);

await mkdir("tmp/care-worker-test", { recursive: true });
globalThis.__careWorkerCalls = [];
await build({
  entryPoints: ["app/api/customer-care/worker/route.ts"], outfile: "tmp/care-worker-test/route.cjs",
  bundle: true, platform: "node", format: "cjs", packages: "external",
  plugins: [{ name: "isolated-worker", setup(b) {
    b.onResolve({ filter: /^@\/lib\/customer-care\/worker$/ }, () => ({ path: "worker", namespace: "test" }));
    b.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export async function runCareWorker(limit){globalThis.__careWorkerCalls.push(limit);return {processed:1};}" }));
  } }],
});
const { GET, POST } = createRequire(import.meta.url)("../tmp/care-worker-test/route.cjs");
const request = (method, secret) => new Request("https://example.test/api/customer-care/worker", {
  method, headers: secret ? { authorization: `Bearer ${secret}` } : {},
});
delete process.env.CRON_SECRET;
assert.equal((await GET(request("GET"))).status, 401);
process.env.CRON_SECRET = cron;
process.env.CUSTOMER_CARE_WORKER_SECRET = worker;
assert.equal((await GET(request("GET", worker))).status, 401);
assert.equal((await POST(request("POST", cron))).status, 401);
assert.deepEqual(globalThis.__careWorkerCalls, []);
assert.equal((await GET(request("GET", cron))).status, 200);
assert.equal((await POST(request("POST", worker))).status, 200);
assert.deepEqual(globalThis.__careWorkerCalls, [5, 5]);
console.log("PASS: scheduler destination, authentication, failures, disabled detection and bounded worker batches.");
