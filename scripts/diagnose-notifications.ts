import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";

// Read-only diagnostics. Never print credentials, recipients, or message bodies.
loadEnvConfig(process.cwd());
async function main() {
  for (const key of [
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "ENQUIRY_TEAM_EMAIL",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_API_VERSION",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_TEMPLATE_PURCHASE_CREATED",
    "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "META_APP_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
  ]) {
    console.log(key, process.env[key]?.trim() ? "SET" : "MISSING");
  }
  if (process.env.DATABASE_URL) {
    const db = neon(process.env.DATABASE_URL);
    for (const query of [
      "select purchase_status, preferred_contact_method, (invoice_email_sent_at is not null) as invoice_sent, (invoice_team_email_sent_at is not null) as invoice_team_sent, (confirmation_email_sent_at is not null) as confirmation_sent, (confirmation_team_email_sent_at is not null) as confirmation_team_sent, whatsapp_status, count(*) from design_purchases group by 1,2,3,4,5,6,7",
      "select status,error_code,count(*) from whatsapp_messages where direction='outbound' group by 1,2",
    ]) {
      try {
        console.log(await db.query(query));
      } catch {
        console.log("Database diagnostic unavailable");
      }
    }
  }
  const version = process.env.WHATSAPP_API_VERSION?.trim() || "v23.0";
  const checks = [
    {
      label: "Resend domains",
      url: "https://api.resend.com/domains",
      token: process.env.RESEND_API_KEY,
    },
    {
      label: "Meta sender",
      url: `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=verified_name,code_verification_status`,
      token: process.env.WHATSAPP_ACCESS_TOKEN,
    },
    {
      label: "Meta templates",
      url: `https://graph.facebook.com/${version}/${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?fields=name,status,language`,
      token: process.env.WHATSAPP_ACCESS_TOKEN,
    },
  ];
  for (const check of checks) {
    if (!check.token) continue;
    try {
      const response = await fetch(check.url, {
        headers: { Authorization: `Bearer ${check.token}` },
        signal: AbortSignal.timeout(12000),
      });
      const data = await response.json();
      console.log(check.label, {
        status: response.status,
        code: data.error?.code || data.name,
        senderStatus: data.code_verification_status,
        items: data.data?.map(
          (item: { name: string; status: string; language?: string }) => ({
            name: item.name,
            status: item.status,
            language: item.language,
          }),
        ),
      });
    } catch {
      console.log(check.label, "Connection unavailable");
    }
  }
}
void main();
