import { loadEnvConfig } from "@next/env";
import { Resend } from "resend";
import { createHmac } from "node:crypto";
loadEnvConfig(process.cwd());
async function main() {
  for (const url of [
    "https://calacot.com/api/whatsapp/webhook",
    "https://www.calacot.com/api/whatsapp/webhook",
    "https://www.calacot.com/api/customer-care/worker",
    "http://localhost:3000/api/whatsapp/webhook",
  ]) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(12000),
      });
      console.log("Endpoint", {
        url,
        status: response.status,
        location: response.headers.get("location"),
        contentType: response.headers.get("content-type"),
        server: response.headers.get("server"),
      });
    } catch (error) {
      const e = error as { cause?: { code?: string }; name?: string };
      console.log("Endpoint", { url, error: e.name, code: e.cause?.code });
    }
  }
  if (process.env.RESEND_API_KEY) {
    const { data, error } = await new Resend(
      process.env.RESEND_API_KEY,
    ).emails.list();
    console.log(
      "Resend recent delivery events",
      error
        ? { name: error.name }
        : data?.data
            .slice(0, 6)
            .map((row) => ({
              createdAt: row.created_at,
              lastEvent: row.last_event,
            })),
    );
  }
  if (process.env.META_APP_SECRET) {
    // Empty signed envelope checks route/authentication only. It cannot create
    // messages, purchases, jobs, opt-outs, receipts or notification sends.
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [],
    });
    const signature = `sha256=${createHmac("sha256", process.env.META_APP_SECRET).update(body).digest("hex")}`;
    for (const url of [
      "http://localhost:3000/api/whatsapp/webhook",
      "https://www.calacot.com/api/whatsapp/webhook",
    ]) {
      try {
        const response = await fetch(url, {
          method: "POST",
          redirect: "manual",
          headers: {
            "Content-Type": "application/json",
            "x-hub-signature-256": signature,
          },
          body,
          signal: AbortSignal.timeout(12000),
        });
        console.log("Empty webhook authentication probe", {
          url,
          status: response.status,
          acknowledged: (await response.text()) === "EVENT_RECEIVED",
        });
      } catch {
        console.log("Empty webhook authentication probe unavailable", { url });
      }
    }
  }
}
void main().catch(() => {
  console.error("Endpoint diagnostic unavailable");
  process.exitCode = 1;
});
