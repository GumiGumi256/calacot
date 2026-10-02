import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
import { createClient } from "next-sanity";

loadEnvConfig(process.cwd());
async function main() {
  const env = process.env;
  const required = [
    "DATABASE_URL",
    "META_APP_SECRET",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "WHATSAPP_ACCESS_TOKEN",
  ];
  console.log("Feature enabled:", env.CUSTOMER_CARE_ENABLED === "true");
  console.log(
    "Missing configuration:",
    required.filter((k) => !env[k]?.trim()),
  );
  console.log(
    "Worker endpoint settings present (scheduler execution not checked):",
    !!env.CUSTOMER_CARE_WORKER_URL && !!env.CUSTOMER_CARE_WORKER_SECRET,
  );
  if (env.DATABASE_URL) {
    const db = neon(env.DATABASE_URL);
    const tables = await db.query(
      "SELECT to_regclass('care_jobs')::text AS jobs, to_regclass('whatsapp_messages')::text AS messages",
    );
    console.log("Database tables:", tables);
    if (tables[0]?.messages)
      console.log(
        "Inbound activity:",
        await db.query(
          "SELECT count(*)::int AS received_last_day,max(created_at) AS last_received_at FROM whatsapp_messages WHERE direction='inbound' AND created_at>now()-interval '24 hours'",
        ),
      );
    if (tables[0]?.jobs) {
      console.log(
        "Queue totals:",
        await db.query(
          "SELECT state,count(*)::int AS count FROM care_jobs GROUP BY state",
        ),
      );
      console.log(
        "Recent job outcomes:",
        await db.query(
          "SELECT state,error_code,attempts,updated_at FROM care_jobs ORDER BY created_at DESC LIMIT 5",
        ),
      );
    }
  }
  if (env.NEXT_PUBLIC_SANITY_PROJECT_ID && env.NEXT_PUBLIC_SANITY_DATASET) {
    const client = createClient({
      projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
      dataset: env.NEXT_PUBLIC_SANITY_DATASET,
      apiVersion: "2025-02-19",
      useCdn: false,
    });
    console.log(
      "Published profile:",
      await client.fetch(
        `*[_id=="customerCareCompanyProfile" && _type=="customerCareCompanyProfile"][0]{approvalStatus, "hasContacts":defined(contactInformation),"hasOverview":defined(overview)}`,
        {},
        { perspective: "published" },
      ),
    );
  }
}
void main().catch(() => {
  console.error(
    "Diagnostic connection failed; no credentials or customer content were logged.",
  );
  process.exitCode = 1;
});
