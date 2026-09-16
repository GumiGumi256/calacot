import type { SendPayload, SendResult } from "./types";

/** Pure transport with injectable fetch for tests; callers supply server-only config. */
export async function postWhatsAppMessage(config: { accessToken: string; phoneNumberId: string; apiVersion: string }, payload: SendPayload, request: typeof fetch = fetch): Promise<SendResult> {
  try {
    const response = await request(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), cache: "no-store",
    });
    const data: unknown = await response.json();
    if (response.ok && data && typeof data === "object" && "messages" in data && Array.isArray(data.messages)) {
      const first: unknown = data.messages[0];
      if (first && typeof first === "object" && "id" in first && typeof first.id === "string" && first.id.startsWith("wamid.")) return { ok: true, wamid: first.id };
    }
    let code = `http_${response.status}`;
    if (data && typeof data === "object" && "error" in data && data.error && typeof data.error === "object" && "code" in data.error && typeof data.error.code === "number") code = `meta_${data.error.code}`;
    return { ok: false, uncertain: response.ok || response.status >= 500, code };
  } catch { return { ok: false, uncertain: true, code: "transport_uncertain" }; }
}
