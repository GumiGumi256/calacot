import Link from "next/link";
import type { receivablesOverview } from "@/lib/finance/receivables";
import { formatAmount } from "@/lib/finance/options";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Data = Awaited<ReturnType<typeof receivablesOverview>>;

/** Read-only receivables overview shared by the Payments and Invoices pages. */
export function ReceivablesPanel({ data, focus }: { data: Data; focus: "payments" | "invoices" }) {
  const exceptions = data.exceptions.filter((x) => (x.href.startsWith("/admin/invoices") ? data.canSeeInvoices : data.canSeePayments));
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{focus === "payments" ? "Collections overview" : "Receivables overview"}</CardTitle>
        <CardDescription>Balances use the existing invoice ledger. Currencies are shown separately and never combined.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.canSeeInvoices && data.balances.map((b) => (
            <div key={`o-${b.currency}`} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">Outstanding invoices ({b.currency})</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatAmount(b.currency, b.outstanding)}</dd>
              <dd className="text-xs text-muted-foreground">{b.open} open; {b.overdue_count} overdue ({formatAmount(b.currency, b.overdue)})</dd>
            </div>
          ))}
          {data.canSeePayments && data.pending.map((p) => (
            <div key={`p-${p.currency}`} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">Awaiting verification ({p.currency})</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatAmount(p.currency, p.amount)}</dd>
              <dd className="text-xs text-muted-foreground">{p.count} payment(s), oldest {formatDate(p.oldest)}</dd>
            </div>
          ))}
          {data.canSeePayments && data.unallocatedTotals.map((u) => (
            <div key={`u-${u.currency}`} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">Confirmed but unallocated ({u.currency})</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatAmount(u.currency, u.amount)}</dd>
              <dd className="text-xs text-muted-foreground">{u.count} payment(s) not fully applied to invoices</dd>
            </div>
          ))}
        </dl>
        {exceptions.length > 0 ? (
          <section aria-labelledby={`${focus}-exceptions`} className="rounded-lg border border-warning-border bg-warning-soft p-3 text-sm">
            <h2 id={`${focus}-exceptions`} className="font-medium">Reconciliation exceptions and pending actions</h2>
            <ul className="mt-1 list-disc pl-5">{exceptions.map((x) => <li key={x.label}><Link className="underline underline-offset-4" href={x.href}>{x.label}</Link></li>)}</ul>
          </section>
        ) : <p className="text-sm text-muted-foreground">No reconciliation exceptions.</p>}
        {focus === "payments" && data.unallocated.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Unallocated confirmed payments (oldest 20)</summary>
            <ul className="mt-2 divide-y">
              {data.unallocated.map((u) => (
                <li key={u.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{u.receipt_number ?? "No receipt"} / {data.canSeeClients ? <Link className="underline underline-offset-4" href={`/admin/clients/${u.client_id}`}>{u.client}</Link> : u.client}</span>
                  <span className="tabular-nums">{formatAmount(u.currency, u.unallocated)} of {formatAmount(u.currency, u.amount)} unallocated</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Allocate from the relevant invoice page using the existing verification form.</p>
          </details>
        )}
        {focus === "invoices" && data.overdue.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Most overdue invoices</summary>
            <ul className="mt-2 divide-y">
              {data.overdue.map((i) => (
                <li key={i.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span><Link className="underline underline-offset-4" href={`/admin/invoices/${i.id}`}>{i.number}</Link> / {data.canSeeClients ? <Link className="underline underline-offset-4" href={`/admin/clients/${i.client_id}`}>{i.client}</Link> : i.client}</span>
                  <span className="tabular-nums">{formatAmount(i.currency, i.balance)} due {i.due}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
