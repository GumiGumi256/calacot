import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256-bit bearer reference; only its digest should be persisted. */
export function newVerificationReference(): string {
  return randomBytes(32).toString("base64url");
}

export function referenceDigest(reference: string): string | null {
  // Canonical encoding prevents alternate representations of the same token.
  if (!/^[A-Za-z0-9_-]{43}$/.test(reference)) return null;
  const bytes = Buffer.from(reference, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== reference) return null;
  return createHash("sha256").update(bytes).digest("hex");
}

export function pdfDigest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Constant-time comparison of two lowercase hex SHA-256 digests. */
export function matchesDigest(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

/** Compares the exact bytes, not extracted text or a rendered representation. */
export function matchesPdfDigest(bytes: Uint8Array, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(pdfDigest(bytes), "hex"), Buffer.from(expected, "hex"));
}
