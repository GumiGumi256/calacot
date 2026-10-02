import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
import { Resend } from "resend";

type MetaTemplate = {
  name?: string;
  status?: string;
  components?: Array<{ buttons?: Array<{ type: string; url?: string }> }>;
  whatsapp_business_api_data?: unknown;
};

loadEnvConfig(process.cwd());
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const orders = await sql.query(
    "select id,purchase_reference,customer_email,created_at,invoice_email_sent_at,invoice_team_email_sent_at from design_purchases order by created_at desc limit 6",
  );
  const team =
    process.env.ENQUIRY_TEAM_EMAIL?.trim().toLowerCase() || "info@calacot.com";
  console.log(
    "Support enabled locally",
    process.env.CUSTOMER_CARE_ENABLED === "true",
  );
  console.log(
    "Recent orders",
    orders.map((p) => ({
      reference: p.purchase_reference,
      createdAt: p.created_at,
      customerEmailEqualsTeam: p.customer_email.toLowerCase() === team,
      customerEmailAccepted: !!p.invoice_email_sent_at,
      teamEmailAccepted: !!p.invoice_team_email_sent_at,
    })),
  );
  const { data, error } = await new Resend(
    process.env.RESEND_API_KEY,
  ).emails.list();
  console.log(
    "Email deliveries",
    error
      ? { code: error.name }
      : data?.data
          .slice(0, 12)
          .map((e) => ({
            createdAt: e.created_at,
            subject: e.subject,
            event: e.last_event,
            toTeam: e.to.some((a) => a.toLowerCase() === team),
            matchesCustomerOrder: orders
              .filter((p) =>
                e.to.some(
                  (a) => a.toLowerCase() === p.customer_email.toLowerCase(),
                ),
              )
              .map((p) => p.purchase_reference),
          })),
  );
  for (const query of [
    "select direction,status,error_code,count(*) from whatsapp_messages where created_at>now()-interval '2 days' group by 1,2,3",
    "select state,error_code,count(*) from care_jobs group by 1,2",
  ])
    console.log(await sql.query(query));
  const base = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v23.0"}/${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}`;
  for (const suffix of [
    "/message_templates?fields=name,status,components",
    "/subscribed_apps",
  ]) {
    try {
      const response = await fetch(base + suffix, {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        },
        signal: AbortSignal.timeout(12000),
      });
      const data = await response.json();
      console.log("Meta", {
        endpoint: suffix,
        status: response.status,
        errorCode: data.error?.code,
        templates: data.data?.map((t: MetaTemplate) => ({
          name: t.name,
          status: t.status,
          buttons: t.components
            ?.flatMap((c) => c.buttons || [])
            .map((b) => ({ type: b.type, url: b.url })),
          subscribed: !!t.whatsapp_business_api_data,
        })),
      });
    } catch (e) {
      console.log("Meta connection unavailable", {
        endpoint: suffix,
        code: (e as { cause?: { code?: string } }).cause?.code,
      });
    }
  }
}
void main().catch(() => {
  console.error("Delivery diagnostic failed");
  process.exitCode = 1;
});
