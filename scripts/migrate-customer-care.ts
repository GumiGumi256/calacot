import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = neon(process.env.DATABASE_URL);
  const migration = await readFile("drizzle/0007_customer_care.sql", "utf8");
  await client.transaction(
    migration
      .split("--> statement-breakpoint")
      .map((s) => client.query(s.trim())),
  );
  console.log(
    "Customer care tables are ready. Existing purchase and WhatsApp tables were preserved.",
  );
}
void main();
