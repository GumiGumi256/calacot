import "server-only";
import { createHmac } from "node:crypto";
import { referenceDigest } from "./verification-crypto";

/**
 * Embedding a verification reference and QR into newly issued commercial PDFs. Off unless
 * explicitly enabled; once enabled, misconfiguration fails closed rather than silently issuing
 * unverifiable documents.
 */
export function verificationEmbedEnabled() {
  return process.env.CALACOT_VERIFICATION_ENABLED === "true" && process.env.CALACOT_VERIFICATION_EMBED === "true";
}

function referenceSecret() {
  const secret = process.env.CALACOT_VERIFICATION_REFERENCE_SECRET;
  if (!secret || secret.length < 32) throw new Error("verification_configuration");
  return secret;
}

/** Canonical public origin printed into PDFs. HTTPS only, except local capture mode. */
export function verificationOrigin() {
  const raw = process.env.CALACOT_VERIFICATION_ORIGIN || process.env.CALACOT_APP_URL;
  let origin: URL;
  try { origin = new URL(raw || ""); } catch { throw new Error("verification_configuration"); }
  const local = (process.env.SALES_NOTIFICATION_MODE || "capture") === "capture" && ["localhost", "127.0.0.1"].includes(origin.hostname);
  if ((origin.protocol !== "https:" && !local) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash)
    throw new Error("verification_configuration");
  return origin.origin;
}

/**
 * Deterministic per-record bearer reference. Re-deriving it lets an interrupted issuance be
 * re-rendered or recovered without ever storing the plaintext. Distinct from legacy references.
 * Rotating the secret changes future references only; finalized records keep their stored digest.
 */
export function embeddedReference(org: string, entity: "quotation" | "invoice", sourceId: string) {
  const reference = createHmac("sha256", referenceSecret()).update(`calacot-verification/embedded/v1\0${org}\0${entity}\0${sourceId}`).digest("base64url");
  const digest = referenceDigest(reference);
  if (!digest) throw new Error("verification_configuration");
  return { reference, digest, url: `${verificationOrigin()}/verify/${reference}` };
}

/** Legacy references (existing unembedded PDFs) keep their original derivation. */
export function legacyReference(org: string, documentId: string) {
  return createHmac("sha256", referenceSecret()).update(`calacot-verification/legacy/v1\0${org}\0${documentId}`).digest("base64url");
}
