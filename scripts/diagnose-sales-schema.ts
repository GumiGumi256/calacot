import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
config({ path: [".env.local", ".env"], quiet: true });

/** Catalog-only inspection. Never changes schema/data or prints connection credentials. */
async function main() {
  const target = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!target) throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL for read-only inspection");
  const query = neon(target).query;
  const constraints = await query(`SELECT c.conname AS name,c.contype AS type,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='staff_memberships' ORDER BY c.conname`);
  console.log("Staff membership constraints:", constraints);
  const dependencies = await query(`SELECT t.relname AS table_name,c.conname AS name,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    WHERE c.contype='f' AND c.confrelid=to_regclass('public.staff_memberships') ORDER BY t.relname,c.conname`);
  console.log("Staff membership foreign keys:", dependencies);
  const columns = await query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'
    AND ((table_name='clients' AND column_name IN('trading_name','department')) OR (table_name='quotations' AND column_name='project_id')) ORDER BY table_name,column_name`);
  console.log("Sales extension columns:", columns);
  const functions = await query(`SELECT proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND proname IN('sales_client','sales_quote_command','sales_claim') ORDER BY proname`);
  console.log("Sales services:", functions);
}
main().catch(error => {
  const code = error && typeof error === "object" && "code" in error ? error.code : "connection_or_configuration";
  console.error("Read-only sales schema inspection failed:", code);
  process.exitCode=1;
});
