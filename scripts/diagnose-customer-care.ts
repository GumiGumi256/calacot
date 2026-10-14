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
  console.log("Reply mode:", env.CUSTOMER_CARE_MODE || "menu", "Delivery mode:", env.CUSTOMER_CARE_NOTIFICATION_MODE || "capture");
  try {
    const target = new URL(env.CUSTOMER_CARE_WORKER_URL || "");
    console.log("Worker target:", target.origin + target.pathname);
  } catch {
    console.log("Worker target: missing or invalid URL");
  }
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
      console.log("Menu database functions:", await db.query(
        "SELECT proname FROM pg_proc WHERE proname IN ('care_menu_commit','care_customer_confirm')",
      ));
      console.log("Conversation handling:", await db.query(
        "SELECT mode,count(*)::int AS count,count(*) FILTER (WHERE assigned_to IS NOT NULL)::int AS assigned FROM care_conversations GROUP BY mode",
      ));
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
