export function recoveryDecision(
  channel: string,
  firstAttempt: string | null,
  providerId: string | null,
  now = new Date(),
) {
  if (providerId) return "complete";
  if (!firstAttempt) return "submit";
  if (channel === "whatsapp") return "uncertain";
  return now.getTime() - new Date(firstAttempt).getTime() < 23 * 3600000
    ? "retry"
    : "uncertain";
}
export function backoff(attempt: number, retryAfter = 0, random = Math.random) {
  return Math.max(
    retryAfter,
    Math.min(3600, 15 * 2 ** Math.min(attempt, 8)) * (0.75 + random() * 0.5),
  );
}
export function whatsappEligible(
  p: {
    recipient: string;
    consentAt?: unknown;
    consentSource?: unknown;
    template?: unknown;
    approved?: unknown;
  },
  optedOut: boolean,
) {
  if (optedOut) return "recipient_opted_out";
  if (!/^\+[1-9]\d{7,14}$/.test(p.recipient)) return "invalid_phone";
  if (!p.consentAt || !p.consentSource) return "consent_missing";
  if (!p.template || p.approved !== true) return "approved_template_missing";
  return null;
}
