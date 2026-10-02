import { timingSafeEqual } from "node:crypto";

export function workerAuthorized(
  header: string | null,
  secret: string | undefined,
) {
  if (!secret || secret.length < 32) return false;
  const actual = Buffer.from(header || "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
