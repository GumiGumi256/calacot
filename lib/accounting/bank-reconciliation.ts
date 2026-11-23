/** Pure calculations for reconciliation. Amounts are integer minor units in one currency. */
export type BankItem = { id: string; accountId: string; currency: string; date: string; amount: bigint; reference?: string | null };
export type LedgerItem = BankItem & { posted: boolean };
export type Allocation = { bankId: string; ledgerId: string; amount: bigint };
export type Suggestion = { bankId: string; ledgerId: string; score: number; signals: string[] };
export type DuplicateCandidate = { incomingId: string; existingId: string; reason: "same reference and amount" | "same date, amount and description" };

/** Exact decimal string (at most 2 decimals) to integer minor units. Never goes through a float. */
export function toMinor(value: string): bigint {
  const s = value.trim();
  if (!/^-?\d{1,15}(?:\.\d{1,2})?$/.test(s)) throw new Error("Invalid amount");
  const negative = s.startsWith("-");
  const [whole, fraction = ""] = (negative ? s.slice(1) : s).split(".");
  const n = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return negative ? -n : n;
}
/** Integer minor units to a plain decimal string with 2 decimals (no grouping). */
export function fromMinor(value: bigint): string {
  const negative = value < BigInt(0);
  const a = negative ? -value : value;
  return `${negative ? "-" : ""}${a / BigInt(100)}.${(a % BigInt(100)).toString().padStart(2, "0")}`;
}

const abs = (n: bigint) => n < BigInt(0) ? -n : n;
const sign = (n: bigint) => n < BigInt(0) ? -1 : n > BigInt(0) ? 1 : 0;
const reference = (s?: string | null) => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
function dayNumber(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");
  const millis = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(millis) || new Date(millis).toISOString().slice(0, 10) !== date) throw new Error("Invalid date");
  return millis / 86400000;
}

/** Suggestions never mutate or confirm transactions; a reference alone is insufficient. */
export function suggestMatches(bank: BankItem, ledger: LedgerItem[], maxDays = 7): Suggestion[] {
  const date = dayNumber(bank.date);
  if (!Number.isInteger(maxDays) || maxDays < 0 || maxDays > 365) throw new Error("Invalid date window");
  return ledger.flatMap((line) => {
    if (!line.posted || line.accountId !== bank.accountId || line.currency !== bank.currency || !sign(bank.amount) || line.amount !== bank.amount) return [];
    const days = Math.abs(dayNumber(line.date) - date);
    if (days > maxDays) return [];
    const sameReference = !!reference(bank.reference) && reference(bank.reference) === reference(line.reference);
    return [{ bankId: bank.id, ledgerId: line.id, score: 50 + (days === 0 ? 20 : Math.max(0, 10 - days)) + (sameReference ? 30 : 0), signals: ["same account", "same currency", "same amount", `${days} days apart`, ...(sameReference ? ["same reference"] : [])] }];
  }).sort((a, b) => b.score - a.score || a.ledgerId.localeCompare(b.ledgerId));
}

/** Validate a proposed allocation set, including partial, one-to-many and many-to-one matches. */
export function allocationResiduals(bank: BankItem[], ledger: LedgerItem[], allocations: Allocation[]) {
  const banks = new Map(bank.map((x) => [x.id, x])); const lines = new Map(ledger.map((x) => [x.id, x]));
  if (banks.size !== bank.length || lines.size !== ledger.length) throw new Error("Duplicate item identity");
  const bankUsed = new Map<string, bigint>(); const ledgerUsed = new Map<string, bigint>(); const pairs = new Set<string>();
  for (const a of allocations) {
    const b = banks.get(a.bankId); const l = lines.get(a.ledgerId);
    if (!b || !l || !l.posted || b.accountId !== l.accountId || b.currency !== l.currency || sign(b.amount) === 0 || sign(b.amount) !== sign(l.amount) || a.amount <= BigInt(0)) throw new Error("Invalid match");
    const pair = JSON.stringify([a.bankId, a.ledgerId]); if (pairs.has(pair)) throw new Error("Duplicate allocation pair"); pairs.add(pair);
    bankUsed.set(b.id, (bankUsed.get(b.id) ?? BigInt(0)) + a.amount);
    ledgerUsed.set(l.id, (ledgerUsed.get(l.id) ?? BigInt(0)) + a.amount);
    if (bankUsed.get(b.id)! > abs(b.amount) || ledgerUsed.get(l.id)! > abs(l.amount)) throw new Error("Match exceeds available amount");
  }
  return {
    bank: bank.map((item) => ({ id: item.id, residual: abs(item.amount) - (bankUsed.get(item.id) ?? BigInt(0)) })),
    ledger: ledger.map((item) => ({ id: item.id, residual: abs(item.amount) - (ledgerUsed.get(item.id) ?? BigInt(0)) })),
  };
}

/**
 * The unexplained difference, identical to bank_reconciliation_figures() in SQL:
 * closing statement + deposits in transit - outstanding payments - unmatched statement net - closing book.
 * Unmatched statement lines are bank items the books do not have yet (they also block finalization).
 */
export function reconciliationDifference(closingStatement: bigint, closingBook: bigint, outstandingDeposits: bigint, outstandingPayments: bigint, unmatchedStatementNet: bigint = BigInt(0)): bigint {
  if (outstandingDeposits < BigInt(0) || outstandingPayments < BigInt(0)) throw new Error("Timing differences must be nonnegative");
  return closingStatement + outstandingDeposits - outstandingPayments - unmatchedStatementNet - closingBook;
}

/** Overlap indicators are deliberately candidates: repeated genuine transactions can look identical. */
export function duplicateCandidates(incoming: (BankItem & { description: string })[], existing: (BankItem & { description: string })[]): DuplicateCandidate[] {
  const result: DuplicateCandidate[] = [];
  const buckets = new Map<string, (BankItem & { description: string })[]>();
  const key = (item: BankItem) => JSON.stringify([item.accountId, item.currency, item.amount.toString(), item.date]);
  for (const item of existing) { const k = key(item); const bucket = buckets.get(k) ?? []; bucket.push(item); buckets.set(k, bucket); }
  for (const a of incoming) for (const b of buckets.get(key(a)) ?? []) {
    const r = reference(a.reference);
    if (r && r === reference(b.reference)) result.push({ incomingId: a.id, existingId: b.id, reason: "same reference and amount" });
    else if (a.description.trim() && a.description.trim().toUpperCase() === b.description.trim().toUpperCase()) result.push({ incomingId: a.id, existingId: b.id, reason: "same date, amount and description" });
    if (result.length > 10000) throw new Error("Too many duplicate candidates; review a smaller statement range");
  }
  return result;
}
