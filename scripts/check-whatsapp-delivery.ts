import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
loadEnvConfig(process.cwd());
async function main() {
  const env = process.env;
  const webhook = new URL("https://www.calacot.com/api/whatsapp/webhook");
  webhook.searchParams.set("hub.mode", "subscribe");
  webhook.searchParams.set("hub.verify_token", env.WHATSAPP_VERIFY_TOKEN || "");
  webhook.searchParams.set("hub.challenge", "care-diagnostic");
  const checks = await Promise.allSettled([
    fetch(webhook, { redirect: "manual", signal: AbortSignal.timeout(20000) }).then(async (r) => ({
      check: "public_webhook", status: r.status, verified: (await r.text()) === "care-diagnostic",
      redirect: r.headers.get("location")?.split("?")[0],
    })),
    fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION || "v23.0"}/${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/subscribed_apps`, {
      headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN?.trim()}` }, signal: AbortSignal.timeout(20000),
    }).then(async (r) => {
      const data = await r.json();
      return { check: "meta_subscribed_apps", status: r.status, count: data.data?.length,
        errorCode: data.error?.code, errorMessage: data.error?.message };
    }),
    neon(env.DATABASE_URL!).query("SELECT direction,status,error_code,count(*)::int AS count,max(created_at) AS latest FROM whatsapp_messages GROUP BY direction,status,error_code"),
  ]);
  checks.forEach((r, i) => console.log(i, r.status === "fulfilled" ? r.value : {
    failed: true, reason: r.reason?.name, networkCode: r.reason?.cause?.code,
  }));
}
main().catch(() => { console.error("Read-only WhatsApp check failed."); process.exitCode = 1; });
