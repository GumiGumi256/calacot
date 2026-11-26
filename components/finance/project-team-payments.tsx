import Link from "next/link";
import { disbursementMethodLabels, expenseStatusLabels, formatAmount } from "@/lib/finance/options";
import { formatDate } from "@/lib/format";
import type { TeamPaymentRow } from "@/lib/projects/workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamPayInfo } from "./team-pay-info";
import { RecordTeamMemberPayment, type TeamPaymentSetup } from "./team-member-payment";

// Keep calculations exact for numeric(17,2) values.
const cents = (v: string | null) => { const [w, f = ""] = (v ?? "0").split("."); return BigInt((w || "0") + f.padEnd(2, "0").slice(0, 2)); };
const money = (c: bigint) => { const neg = c < BigInt(0); const a = neg ? -c : c; return `${neg ? "-" : ""}${a / BigInt(100)}.${(a % BigInt(100)).toString().padStart(2, "0")}`; };

type Line = TeamPaymentRow["lines"][number];
/** One history entry per payment share: when and how it was paid, or why it is not paid yet. */
function HistoryRow({ line, currency }: { line: Line; currency: string }) {
  const paid = line.status === "paid";
  const dates = line.payments.map((p) => formatDate(p.paidOn)).join(", ");
  const how = line.payments.map((p) => [disbursementMethodLabels[p.method] ?? p.method, p.reference ? `Ref ${p.reference}` : null].filter(Boolean).join(" · ")).join("; ");
  const state = paid ? (dates || formatDate(line.incurredOn)) : line.payments.length ? `Part paid ${dates}` : line.status === "approved" ? "Approved, not yet paid" : expenseStatusLabels[line.status] ?? line.status;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 py-2">
      <span className={paid ? "font-medium text-foreground" : ""}>{state}</span>
      <span className={`text-right tabular-nums ${paid ? "font-medium text-foreground" : ""}`}>{formatAmount(currency, line.amount)}</span>
      <span className="col-span-2 min-w-0 break-words">{how ? <>{how} · </> : null}<Link className="underline-offset-4 hover:underline" href={`/admin/expenses/${line.expenseId}`}>{line.description}</Link></span>
    </li>
  );
}

/**
 * For each team member: what they will earn in total, what they have been paid so far and what is still
 * owed, with a dated history of every payment (instalments) including its method and reference.
 */
export function ProjectTeamPayments({ rows, payment }: { rows: TeamPaymentRow[]; payment?: TeamPaymentSetup | null }) {
  const currencies = [...new Set(rows.map(r => r.currency))];
  return <Card className="lg:col-span-2">
    <CardHeader><div className="flex items-center gap-2"><CardTitle>Team pay</CardTitle><TeamPayInfo /></div><CardDescription>What each person will earn, what they have been paid so far, and every payment made.</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No team pay recorded yet. Set each person&apos;s agreed pay in the project team, then record payments as they are made. If they were paid out of an expense already recorded, open that expense and choose <strong className="font-medium text-foreground">Allocate to team members</strong> instead, so spending is not counted twice.</p> : currencies.map(currency => {
        const list = rows.filter(r => r.currency === currency);
        const total = (key: "agreed" | "paid" | "approved" | "pending") => money(list.reduce((sum, r) => sum + cents(r[key]), BigInt(0)));
        const totalOwed = money(list.reduce((sum, r) => { const owed = r.agreed === null ? BigInt(0) : cents(r.agreed) - cents(r.paid); return sum + (owed > BigInt(0) ? owed : BigInt(0)); }, BigInt(0)));
        return <section key={currency} aria-label={`Team pay in ${currency}`} className="space-y-3">
          {currencies.length > 1 && <h3 className="text-sm font-medium">{currency}</h3>}
          <ul className="space-y-3 text-sm">{list.map(r => {
            const owed = r.agreed === null ? null : cents(r.agreed) - cents(r.paid);
            const progress = r.agreed && cents(r.agreed) > BigInt(0) ? Math.min(100, Number((cents(r.paid) * BigInt(1000)) / cents(r.agreed)) / 10) : null;
            return <li key={r.member_id} className="rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><p className="font-medium break-words">{r.name}</p>{r.detail && <p className="mt-0.5 text-xs text-muted-foreground">{r.detail}</p>}</div>
                {payment && <RecordTeamMemberPayment setup={payment} memberId={r.member_id} name={r.name} currency={currency} owed={owed !== null && owed > BigInt(0) ? money(owed) : null} />}
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-3 tabular-nums">
                <div><dt className="text-xs text-muted-foreground">Will earn</dt><dd className="font-medium">{r.agreed === null ? <span className="text-muted-foreground">Not set</span> : formatAmount(currency, r.agreed)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Paid so far</dt><dd className="font-medium text-success">{formatAmount(currency, r.paid)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Still owed</dt><dd className="font-medium">{owed === null ? "—" : owed < BigInt(0) ? <span className="text-destructive">Overpaid {formatAmount(currency, money(-owed))}</span> : owed === BigInt(0) ? "Fully paid" : formatAmount(currency, money(owed))}</dd></div>
              </dl>
              {progress !== null && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${r.name}: share of agreed pay paid`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><div className="h-full rounded-full bg-success" style={{ width: `${progress}%` }} /></div>}
              {(cents(r.approved) > BigInt(0) || cents(r.pending) > BigInt(0)) && <p className="mt-2 text-xs text-muted-foreground">Not counted as paid yet: {[cents(r.approved) > BigInt(0) ? `${formatAmount(currency, r.approved)} approved, not yet paid` : null, cents(r.pending) > BigInt(0) ? `${formatAmount(currency, r.pending)} awaiting approval` : null].filter(Boolean).join(" · ")}</p>}
              {r.lines.length > 0 ? (
                <details className="mt-3 text-xs text-muted-foreground" open={r.lines.length <= 3}>
                  <summary className="cursor-pointer font-medium">Payment history ({r.lines.length})</summary>
                  <ul className="mt-1 divide-y divide-card-edge">{r.lines.map(l => <HistoryRow key={l.expenseId} line={l} currency={currency} />)}</ul>
                </details>
              ) : <p className="mt-3 text-xs text-muted-foreground">No payments recorded yet.</p>}
            </li>;
          })}</ul>
          <details className="text-sm"><summary className="cursor-pointer font-medium">Totals in {currency}</summary><dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">{[["Will earn (agreed)", total("agreed")], ["Paid so far", total("paid")], ["Still owed", totalOwed], ["Approved, not yet paid", total("approved")], ["Awaiting approval", total("pending")]].map(([label, amount]) => <div key={label} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{formatAmount(currency, amount)}</dd></div>)}</dl></details>
        </section>;
      })}
    </CardContent>
  </Card>;
}
