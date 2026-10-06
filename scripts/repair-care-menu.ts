import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { splitSql, resumableStatement } from "./sales-migration-plan";

loadEnvConfig(process.cwd());
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const db = neon(url);
  const state = splitSql(await readFile("drizzle-current/0002_care_menu_state.sql", "utf8"));
  const commands = splitSql(await readFile("database/care-menu-functions.sql", "utf8"));
  const statements = [
    "SET LOCAL lock_timeout='5s'",
    ...state.map(resumableStatement),
    "ALTER TABLE care_jobs ADD COLUMN IF NOT EXISTS decision jsonb",
    "ALTER TABLE whatsapp_messages DROP CONSTRAINT IF EXISTS whatsapp_messages_status_check",
    "ALTER TABLE whatsapp_messages ADD CONSTRAINT whatsapp_messages_status_check CHECK (status IS NULL OR status IN ('queued','captured','sending','sent','delivered','read','failed','uncertain'))",
    ...commands,
  ];
  await db.transaction(statements.map((statement) => db.query(statement)));
  console.log("Customer care menu schema and commands repaired; existing conversations preserved.");
  console.log(await db.query("SELECT organization_id,menu_state,session_revision FROM care_conversations LIMIT 1"));
}
main().catch(() => {
  console.error("Customer care menu repair failed; transaction rolled back.");
  process.exitCode = 1;
});
