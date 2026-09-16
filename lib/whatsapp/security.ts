import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(raw: Uint8Array, signature: string | null, secret: string): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const received = Buffer.from(signature.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(raw).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}
export function verifyWebhookChallenge(url: URL, expected: string | undefined) {
  if (!expected) return new Response("Webhook verification is unavailable", { status: 503 });
  const token = url.searchParams.get("hub.verify_token") || "";
  const match = token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  const challenge = url.searchParams.get("hub.challenge");
  return url.searchParams.get("hub.mode") === "subscribe" && match && challenge
    ? new Response(challenge, { status: 200 }) : new Response("Verification failed", { status: 403 });
}
export async function readWebhookBody(request: Request, maxBytes = 1024 * 1024) {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new Error("body_too_large");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("body_too_large"); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
