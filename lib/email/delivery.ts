import type { CreateEmailOptions } from "resend";

export type EmailSend = (payload: CreateEmailOptions, options: { idempotencyKey: string }) => Promise<{
  data: { id: string } | null;
  error: { name: string; statusCode?: number | null } | null;
}>;

export async function sendEmailWithRetry(
  payload: CreateEmailOptions, key: string, send: EmailSend,
  pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let code = "network_failure";
    let retry = true;
    try {
      const { data, error } = await send(payload, { idempotencyKey: key });
      if (!error && data?.id) return data.id;
      code = error?.name || "missing_response";
      retry = !!error && (error.statusCode === 429 || (error.statusCode ?? 0) >= 500);
    } catch { /* Retry transport failures with the same payload and key. */ }
    if (!retry || attempt === 2) {
      console.error("Notification email failed", { reference: key, code });
      return null;
    }
    await pause(1000 * 2 ** attempt);
  }
  return null;
}
