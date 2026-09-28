import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

// Apply only the additive, idempotent notification columns to the configured database.
loadEnvConfig(process.cwd());
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const migration = await readFile("drizzle/0006_purchase_team_emails.sql", "utf8");
  await sql.transaction(migration.split("--> statement-breakpoint").map(statement => sql.query(statement.trim())));
  console.log("Purchase team email tracking columns are ready.");
}
void main();
