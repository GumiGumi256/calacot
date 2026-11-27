// TEMPORARY read-only diagnostic. Preview deployments only (behind Vercel Authentication).
// Never returns the access token. Not for merging.
import { createHash } from "node:crypto";
import { connection } from "next/server";

const TEMPLATES = ["calacot_payment_receipt", "calacot_invoice_ready"];

export async function GET() {
  await connection();
  if (process.env.VERCEL_ENV !== "preview") return new Response("Not found", { status: 404 });
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || "";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
  const configuredWaba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || "";
  const v = process.env.WHATSAPP_API_VERSION?.trim() || "v23.0";
  const scrub = (x: unknown) => JSON.parse(JSON.stringify(x).split(token).join("<token>"));
  const get = async (path: string) => {
    try {
      const r = await fetch(`https://graph.facebook.com/${v}/${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
      return { status: r.status, body: scrub(await r.json()) };
    } catch (e) { return { status: 0, body: String(e) }; }
  };
  const debug = await get(`debug_token?input_token=${encodeURIComponent(token)}`);
  const d = (debug.body as { data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } }).data;
  const wabas = new Set<string>([configuredWaba]);
  for (const s of d?.granular_scopes || []) if (s.scope.startsWith("whatsapp_")) for (const id of s.target_ids || []) wabas.add(id);
  const accounts = [];
  for (const waba of wabas) {
    if (!waba) continue;
    const info = await get(`${waba}?fields=id,name,currency,timezone_id,message_template_namespace`);
    const phones = await get(`${waba}/phone_numbers?fields=id,display_phone_number,verified_name,status`);
    const tpl = await get(`${waba}/message_templates?fields=id,name,status,language,category,components&limit=250`);
    const list = (tpl.body as { data?: { name: string; status: string; language: string; category: string; id: string; components?: unknown }[] }).data;
    accounts.push({
      waba, isConfiguredWaba: waba === configuredWaba, info,
      phoneIds: (phones.body as { data?: { id: string; display_phone_number: string; verified_name: string; status: string }[] }).data?.map((p) => ({ id: p.id, isConfiguredSender: p.id === phoneId, number: p.display_phone_number?.replace(/\d(?=\d{4})/g, "•"), name: p.verified_name, status: p.status })) ?? phones,
      templateStatus: tpl.status,
      templates: list?.map((t) => ({ id: t.id, name: t.name, status: t.status, language: t.language, category: t.category, ...(TEMPLATES.includes(t.name) ? { components: t.components } : {}) })) ?? tpl.body,
    });
  }
  const sender = await get(`${phoneId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,platform_type,status`);
  return Response.json({
    apiVersion: v,
    tokenFingerprint: createHash("sha256").update(token).digest("hex").slice(0, 12),
    configuredPhoneNumberId: phoneId, configuredWaba,
    sender: scrub({ ...sender, body: { ...(sender.body as object), display_phone_number: String((sender.body as { display_phone_number?: string }).display_phone_number || "").replace(/\d(?=\d{4})/g, "•") } }),
    token: { status: debug.status, type: (d as { type?: string })?.type, app_id: (d as { app_id?: string })?.app_id, is_valid: (d as { is_valid?: boolean })?.is_valid, expires_at: (d as { expires_at?: number })?.expires_at, granular_scopes: d?.granular_scopes, error: (debug.body as { error?: unknown }).error },
    accounts,
  }, { headers: { "Cache-Control": "no-store" } });
}
