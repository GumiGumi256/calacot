// Runs every self-contained verification script with a scrubbed environment: no database URL, no
// Clerk keys, no messaging credentials. Scripts that load environment files (dotenv, .env.local) or
// need a database URL on stdin are skipped automatically and listed. Refuses to start if the calling
// shell carries live credentials. Usage: node scripts/run-safe-tests.mjs
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { liveCredentialProblems, loadsEnvironmentFiles } from "./test-safety.mjs";

const live = liveCredentialProblems(process.env);
if (live.length) { console.error("Refusing to run tests: the shell carries live credentials:\n - " + live.join("\n - ")); process.exit(2); }

const keep = ["PATH", "Path", "PATHEXT", "SYSTEMROOT", "SystemRoot", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ComSpec", "COMSPEC", "OS", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "WINDIR", "TZ"];
const env = Object.fromEntries(keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
env.NODE_ENV = "test";

const scripts = (await readdir("scripts")).filter((f) => /^verify-.*\.(mjs|mts|ts|cjs)$/.test(f)).sort();
const results = [];
for (const f of scripts) {
  const src = await readFile(`scripts/${f}`, "utf8");
  if (/postgres/.test(f)) { results.push({ script: f, status: "skipped", reason: "needs a fixture PostgreSQL URL on stdin (run against the local throwaway server)" }); continue; }
  if (loadsEnvironmentFiles(src)) { results.push({ script: f, status: "skipped", reason: "loads environment files / live services" }); continue; }
  const cmd = f.endsWith(".mjs") || f.endsWith(".cjs") ? ["node", [`scripts/${f}`]] : ["npx", ["tsx", `scripts/${f}`]];
  const t = Date.now();
  const r = spawnSync(cmd[0], cmd[1], { env, encoding: "utf8", timeout: 600_000, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  results.push({ script: f, status: r.status === 0 ? "pass" : "fail", ms: Date.now() - t, ...(r.status === 0 ? {} : { tail: out.split("\n").filter((l) => !/^\s+at /.test(l)).slice(-6).join("\n") }) });
  console.log(`${r.status === 0 ? "PASS" : "FAIL"} ${f} (${Date.now() - t} ms)`);
}
await mkdir("tmp", { recursive: true });
await writeFile("tmp/safe-test-results.json", JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.status === "fail");
const skipped = results.filter((r) => r.status === "skipped");
console.log(`\n${results.length - skipped.length - failed.length} passed, ${failed.length} failed, ${skipped.length} skipped (details in tmp/safe-test-results.json).`);
for (const s of skipped) console.log(`  skipped ${s.script}: ${s.reason}`);
for (const x of failed) console.log(`\nFAILED ${x.script}\n${x.tail}`);
process.exit(failed.length ? 1 : 0);
