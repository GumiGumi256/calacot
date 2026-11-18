// Phase 1E static regression guards for defects found during browser acceptance:
// 1. Base UI <Button> defaults to type="button": a Button inside a form that carries
//    name/value or is the only submit control must declare type="submit".
// 2. API routes must not match the proxy's tenant pattern /{slug}/admin/... (e.g. /api/admin/x),
//    which would send scheduler/webhook calls to sign-in.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") yield* walk(p); } else yield p;
  }
}
const problems = [];
for (const root of ["components", "app"]) for await (const file of walk(root)) {
  if (!file.endsWith(".tsx")) continue;
  const src = await readFile(file, "utf8");
  if (!/<form\b/.test(src)) continue;
  for (const m of src.matchAll(/<Button(\s[^>]*)?>/g)) {
    const attrs = m[1] ?? "";
    if (/\btype=|render=|onClick=/.test(attrs) || attrs.trim().endsWith("/")) continue;
    if (/\bname=|disabled=\{pending\}/.test(attrs)) problems.push(`${file}: ${m[0].slice(0, 80)}`);
  }
}
assert.deepEqual(problems, [], `submit buttons without type="submit":\n${problems.join("\n")}`);
const tenantPattern = /^\/([^/]+)\/admin(?:\/(.*))?$/; // keep in sync with proxy.ts
const routes = [];
for await (const file of walk("app/api")) if (file.endsWith("route.ts")) routes.push("/" + file.replace(/\\/g, "/").replace(/^app\//, "").replace(/\/route\.ts$/, ""));
const shadowed = routes.filter((r) => tenantPattern.test(r));
assert.deepEqual(shadowed, [], `API routes captured by the proxy tenant pattern: ${shadowed.join(", ")}`);
const proxy = await readFile("proxy.ts", "utf8");
assert(proxy.includes("/^\\/([^/]+)\\/admin(?:\\/(.*))?$/"), "proxy tenant pattern changed; update this guard");
console.log(`PASS: ${routes.length} API routes clear of the proxy tenant pattern; every form submit button declares type="submit".`);
