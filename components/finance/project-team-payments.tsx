import Link from "next/link";
import { expenseStatusLabels, formatAmount } from "@/lib/finance/options";
import { formatDate } from "@/lib/format";
import type { TeamPaymentRow } from "@/lib/projects/workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamPayInfo } from "./team-pay-info";

// Keep calculations exact for numeric(17,2) values.
const cents = (v: string | null) => { const [w, f = ""] = (v ?? "0").split("."); return BigInt((w || "0") + f.padEnd(2, "0").slice(0, 2)); };
const money = (c: bigint) => { const neg = c < BigInt(0); const a = neg ? -c : c; return `${neg ? "-" : ""}${a / BigInt(100)}.${(a % BigInt(100)).toString().padStart(2, "0")}`; };

export function ProjectTeamPayments({ rows }: { rows: TeamPaymentRow[] }) {
  const currencies = [...new Set(rows.map(r => r.currency))];
  return <Card className="lg:col-span-2">
    <CardHeader><div className="flex items-center gap-2"><CardTitle>Team pay</CardTitle><TeamPayInfo /></div><CardDescription>Agreed pay and payments for each team member.</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No team pay recorded yet. Set agreed pay in the project team and add payment shares to expenses.</p> : currencies.map(currency => {
        const list = rows.filter(r => r.currency === currency);
        const total = (key: "agreed" | "paid" | "approved" | "pending") => money(list.reduce((sum, r) => sum + cents(r[key]), BigInt(0)));
        const totalOwed = money(list.reduce((sum, r) => { const owed = r.agreed === null ? BigInt(0) : cents(r.agreed) - cents(r.paid); return sum + (owed > BigInt(0) ? owed : BigInt(0)); }, BigInt(0)));
        return <section key={currency} aria-label={`Team pay in ${currency}`} className="space-y-3">
          {currencies.length > 1 && <h3 className="text-sm font-medium">{currency}</h3>}
          <ul className="divide-y overflow-hidden rounded-(--card-radius-inner) border border-card-edge text-sm">{list.map(r => {
            const owed = r.agreed === null ? null : cents(r.agreed) - cents(r.paid);
            return <li key={r.member_id} className="px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium break-words">{r.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{r.detail && <>{r.detail} · </>}{r.agreed === null ? "Agreed pay not set" : `Agreed: ${formatAmount(currency, r.agreed)}`}</p></div><dl className="flex gap-5 text-right tabular-nums"><div><dt className="text-xs text-muted-foreground">Paid</dt><dd className="font-medium text-success">{formatAmount(currency, r.paid)}</dd></div><div><dt className="text-xs text-muted-foreground">Still owed</dt><dd className="font-medium">{owed === null ? "Not set" : owed < BigInt(0) ? <span className="text-destructive">Overpaid {formatAmount(currency, money(-owed))}</span> : formatAmount(currency, money(owed))}</dd></div></dl></div>
              {(r.lines.length > 0 || cents(r.approved) > BigInt(0) || cents(r.pending) > BigInt(0)) && <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Payment details</summary><div className="mt-2 space-y-1"><p>Approved, not yet paid: {formatAmount(currency, r.approved)} · Awaiting approval: {formatAmount(currency, r.pending)}</p>{r.lines.length > 0 && <ul className="space-y-1">{r.lines.map(l => <li key={l.expenseId}>{formatDate(l.incurredOn)}: <Link className="underline-offset-4 hover:underline" href={`/admin/expenses/${l.expenseId}`}>{l.description}</Link> · {formatAmount(currency, l.amount)} · {expenseStatusLabels[l.status] ?? l.status}</li>)}</ul>}</div></details>}
            </li>;
          })}</ul>
          <details className="text-sm"><summary className="cursor-pointer font-medium">Totals in {currency}</summary><dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">{[["Agreed", total("agreed")], ["Paid", total("paid")], ["Still owed", totalOwed], ["Approved, not yet paid", total("approved")], ["Awaiting approval", total("pending")]].map(([label, amount]) => <div key={label} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{formatAmount(currency, amount)}</dd></div>)}</dl></details>
        </section>;
      })}
    </CardContent>
  </Card>;
}
