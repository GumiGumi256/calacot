/**
 * A sent quotation past its validity date is expired, even though the stored version status is
 * still "sent". This mirrors the list query (lib/sales/queries.ts listBase), so the detail page
 * and the list always agree. Pure, so it can run anywhere and be tested.
 */
export function effectiveQuotationStatus(status: string, validUntil: unknown, now: Date = new Date()) {
  if (status !== "sent" || !validUntil) return status;
  const until = new Date(String(validUntil));
  return !Number.isNaN(until.getTime()) && until <= now ? "expired" : status;
}
