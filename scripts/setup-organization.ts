import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
config({ path: [".env.local", ".env"], quiet: true });
async function main() {
  const id = process.env.CALACOT_CLERK_ORG_ID?.trim();
  const legalName = process.argv[2]?.trim();
  const url = process.env.DATABASE_URL;
  if (!id || !url) throw new Error("Configure CALACOT_CLERK_ORG_ID and DATABASE_URL first.");
  if (!legalName || legalName.length > 200) throw new Error('Usage: npm run organization:setup -- "Approved legal company name"');
  const sql = neon(url);
  await sql.query("INSERT INTO organizations(id,name,legal_name) VALUES($1,$2,$2) ON CONFLICT(id) DO NOTHING", [id, legalName]);
  console.log("Organization record is present. Existing company settings were preserved.");
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Organization setup failed"); process.exitCode = 1; });
