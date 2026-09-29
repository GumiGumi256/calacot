import type { SendPayload, SendResult } from "./types";

/** Pure transport with injectable fetch for tests; callers supply server-only config. */
export async function postWhatsAppMessage(config: { accessToken: string; phoneNumberId: string; apiVersion: string }, payload: SendPayload, request: typeof fetch = fetch): Promise<SendResult> {
  let response: Response;
  try {
    response = await request(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), cache: "no-store",
    });
  } catch (error) {
    // Network/timeout/DNS failure before a response arrived; surface the reason instead of a generic code.
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error("WhatsApp request failed before receiving a response", { reason });
    return { ok: false, uncertain: true, code: `transport_uncertain:${reason.slice(0, 120)}` };
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("WhatsApp response was not valid JSON", { status: response.status, reason });
    return { ok: false, uncertain: response.status >= 500, code: `invalid_response_${response.status}` };
  }
  if (response.ok && data && typeof data === "object" && "messages" in data && Array.isArray(data.messages)) {
    const first: unknown = data.messages[0];
    if (first && typeof first === "object" && "id" in first && typeof first.id === "string" && first.id.startsWith("wamid.")) return { ok: true, wamid: first.id };
  }
  let code = `http_${response.status}`;
  if (data && typeof data === "object" && "error" in data && data.error && typeof data.error === "object") {
    const err = data.error as { code?: number; error_subcode?: number; message?: string; error_data?: { details?: string } };
    if (typeof err.code === "number") code = `meta_${err.code}${err.error_subcode ? `_${err.error_subcode}` : ""}`;
    console.error("WhatsApp provider rejected the message", { status: response.status, code, message: err.message, details: err.error_data?.details });
  }
  return { ok: false, uncertain: response.ok || response.status >= 500, code };
}
