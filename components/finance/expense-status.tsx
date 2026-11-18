import { Badge } from "@/components/ui/badge";
import { expenseStatusLabels, formatAmount } from "@/lib/finance/options";

export function ExpenseStatusBadge({ status, reconciled }: { status: string; reconciled?: boolean }) {
  const variant = status === "rejected" ? "destructive" : status === "approved" || status === "paid" ? "default" : status === "returned" ? "outline" : "secondary";
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge variant={variant}>{expenseStatusLabels[status] ?? status}</Badge>
      {reconciled && <Badge variant="outline">Reconciled</Badge>}
    </span>
  );
}

/**
 * Explains the distinct amounts: what was requested, what is authorized, what was paid and
 * what has been matched to a statement. Each figure is in the expense's own currency.
 */
export function AmountBreakdown({ currency, status, total, disbursed, reconciled }: { currency: string; status: string; total: string; disbursed: string; reconciled: string }) {
  const approved = ["approved", "paid"].includes(status) ? Number(total) : 0;
  const outstanding = status === "approved" ? Number(total) - Number(disbursed) : 0;
  const items = [
    { label: "Requested", value: Number(total), help: "Amount on the request" },
    { label: "Approved", value: approved, help: approved ? "Authorized to spend" : "Not yet approved" },
    { label: "Disbursed", value: Number(disbursed), help: "Payments recorded by finance" },
    { label: "Reconciled", value: Number(reconciled), help: "Matched to a statement" },
    { label: "Outstanding", value: outstanding, help: "Approved but not yet paid" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((i) => (
        <div key={i.label} className="rounded-lg border p-3">
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd className="text-base font-semibold tabular-nums">{formatAmount(currency, i.value)}</dd>
          <dd className="text-xs text-muted-foreground">{i.help}</dd>
        </div>
      ))}
    </dl>
  );
}
