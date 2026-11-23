import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ledgerAmount } from "@/lib/accounting/format";
import { formatDate } from "@/lib/format";

const sections = [
  { href: "/admin/accounting/banking", label: "Overview" },
  { href: "/admin/accounting/banking/cash", label: "Cash" },
  { href: "/admin/accounting/banking/import", label: "Import statement" },
  { href: "/admin/accounting/reconciliation", label: "Reconciliation" },
  { href: "/admin/accounting/banking/reports", label: "Reports" },
  { href: "/admin/accounting/banking/setup", label: "Accounts and mappings" },
];

/** Banking sub-sections, under the main Accounting tabs. */
export function BankingNav({ current }: { current: string }) {
  return (
    <nav aria-label="Banking sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {sections.map((s) => (
        <Button key={s.href} size="sm" variant={current === s.href ? "secondary" : "ghost"} className="shrink-0" render={<Link href={s.href} aria-current={current === s.href ? "page" : undefined} />}>
          {s.label}
        </Button>
      ))}
    </nav>
  );
}

/** Money with its currency, exact (decimal strings only, never floats). */
export function Money({ currency, value, strong = false }: { currency: string; value: string | null | undefined; strong?: boolean }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return <span className={strong ? "font-medium tabular-nums" : "tabular-nums"}><span className="text-muted-foreground">{currency} </span>{ledgerAmount(value)}</span>;
}

/**
 * The three balances, always labelled and never merged: book (posted ledger), statement (latest
 * imported bank line) and reconciled (last finalized period). No provider-confirmed balance exists.
 */
export function Balances({ currency, book, statement, statementDate, reconciled, reconciledTo }: { currency: string; book: string; statement: string | null; statementDate: string | null; reconciled: string | null; reconciledTo: string | null }) {
  return (
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
      <div><dt className="text-muted-foreground">Book balance <span className="sr-only">(posted ledger entries)</span></dt><dd className="text-base"><Money currency={currency} value={book} strong /></dd><dd className="text-xs text-muted-foreground">Posted ledger entries</dd></div>
      <div><dt className="text-muted-foreground">Statement balance</dt><dd className="text-base"><Money currency={currency} value={statement} strong /></dd><dd className="text-xs text-muted-foreground">{statementDate ? `Imported statement, ${formatDate(statementDate)}` : "No running balance imported"}</dd></div>
      <div><dt className="text-muted-foreground">Reconciled balance</dt><dd className="text-base"><Money currency={currency} value={reconciled} strong /></dd><dd className="text-xs text-muted-foreground">{reconciledTo ? `Finalized to ${formatDate(reconciledTo)}` : "Never reconciled"}</dd></div>
    </dl>
  );
}

export const providerBalanceNote = "Provider-confirmed balances are not available: no bank or mobile-money connection exists. Statement balances come only from imported statements.";
