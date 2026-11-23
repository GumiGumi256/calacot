// Starts `next dev` for browser acceptance with ONLY the isolated environment.
// Next.js loads .env, .env.local and .env.development* by itself, which would mix live values into
// an "isolated" session. So this refuses to run in a directory that has any of those files: run it
// from a separate git worktree (git worktree add ../calacot-acceptance <branch>) that contains only
// .env.isolated. Usage (inside the worktree): node scripts/start-isolated-dev.mjs
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { isolatedEnvironmentProblems } from "./test-safety.mjs";

const loaded = [".env", ".env.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"].filter((f) => existsSync(f));
if (loaded.length) {
  console.error(`Refusing: ${loaded.join(", ")} present here. Next.js would load them alongside the isolated settings. Use a separate worktree that only has .env.isolated.`);
  process.exit(2);
}
if (!existsSync(".env.isolated")) { console.error("Refusing: .env.isolated not found."); process.exit(2); }
const env = {};
for (const line of readFileSync(".env.isolated", "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2"); }
const problems = isolatedEnvironmentProblems(env);
if (problems.length) { console.error("Refusing: .env.isolated is not isolated.\n - " + problems.join("\n - ")); process.exit(1); }
const keep = ["PATH", "Path", "PATHEXT", "SYSTEMROOT", "SystemRoot", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ComSpec", "WINDIR"];
const childEnv = { ...Object.fromEntries(keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]])), ...env, NEXT_TELEMETRY_DISABLED: "1" };
// Pin the port to CALACOT_APP_URL (default 3100) so the isolated app can never be confused with a
// normal `next dev` on 3000, which loads the live .env.local.
const port = (() => { try { return new URL(env.CALACOT_APP_URL || "http://localhost:3100").port || "3100"; } catch { return "3100"; } })();
if (port === "3000") { console.error("Refusing port 3000: it is the default for a normal (live) dev server. Use CALACOT_APP_URL=http://localhost:3100."); process.exit(2); }
console.log(`Starting next dev on http://localhost:${port} with the isolated environment only (messaging in capture mode).`);
spawn("npx", ["next", "dev", "--port", port], { env: childEnv, stdio: "inherit", shell: process.platform === "win32" }).on("exit", (code) => process.exit(code ?? 0));
