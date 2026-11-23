// Validates an isolated environment file before a dev server or browser acceptance run.
// Usage: node scripts/check-isolated-env.mjs .env.isolated
// Refuses to open the live environment files. Prints variable NAMES only, never values.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { isolatedEnvironmentProblems } from "./test-safety.mjs";

const file = process.argv[2];
if (!file) { console.error("Usage: node scripts/check-isolated-env.mjs <isolated env file>"); process.exit(2); }
const name = basename(file);
if ([".env", ".env.local", ".env.production", ".env.production.local", ".env.development.local"].includes(name) || !/isolated/i.test(name)) {
  console.error(`Refusing to read ${name}: only a dedicated isolated file (for example .env.isolated) is checked.`);
  process.exit(2);
}
const env = {};
for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
}
const problems = isolatedEnvironmentProblems(env);
if (problems.length) { console.error(`NOT ISOLATED (${problems.length} problem(s)):`); for (const p of problems) console.error(` - ${p}`); process.exit(1); }
console.log(`PASS: ${name} is isolated (development Clerk keys, allow-listed database host, messaging in capture mode, no live secrets).`);
