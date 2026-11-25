import type { ReactNode } from "react";
import { formatAmount } from "@/lib/finance/options";
import type { ProjectFinanceRow } from "@/lib/projects/workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Exact decimal arithmetic on numeric(17,2) strings.
const cents = (v: string | null | undefined) => {
  const [w, f = ""] = String(v ?? "0").replace(/^-/, "").split(".");
  const c = BigInt((w || "0") + f.padEnd(2, "0").slice(0, 2));
  return String(v ?? "").startsWith("-") ? -c : c;
};
const money = (c: bigint) => {
  const neg = c < BigInt(0); const a = neg ? -c : c;
  return `${neg ? "-" : ""}${a / BigInt(100)}.${(a % BigInt(100)).toString().padStart(2, "0")}`;
};
const percent = (part: bigint, whole: bigint) => (whole === BigInt(0) ? null : `${(Number((part * BigInt(1000)) / whole) / 10).toFixed(1)}%`);

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-words text-base font-semibold tabular-nums sm:text-lg ${tone === "bad" ? "text-destructive" : ""}`}>{value}</dd>
      {hint && <dd className="mt-1 text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

/**
 * Project cost and profit in the project currency. Active projects show spending so far and a projected
 * profit that also counts agreed team pay not yet expensed; completed projects show the final figures.
 */
export function ProjectFinancials({ f, contractControl }: { f: ProjectFinanceRow; contractControl?: ReactNode }) {
  const c = f.currency;
  const done = f.status === "completed";
  const contractSource = f.contract_set !== null ? "set" : f.quotation_total !== null ? "quotation" : null;
  const contract = contractSource === "set" ? cents(f.contract_set) : contractSource === "quotation" ? cents(f.quotation_total) : null;
  const spent = cents(f.spent);
  const owed = cents(f.team_owed);
  const projectedCost = spent + owed;
  const profit = contract === null ? null : contract - spent;
  const projected = contract === null ? null : contract - projectedCost;
  const used = contract === null ? null : percent(spent, contract);
  const invoiced = f.invoiced === null ? null : cents(f.invoiced);
  const balance = f.invoice_balance === null ? null : cents(f.invoice_balance);
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{done ? "Final project figures" : f.status === "cancelled" ? "Project figures (cancelled)" : "Project cost and profit"}</CardTitle>
          <CardDescription>
            {c} only. Spent counts approved and paid expenses.{" "}
            {contractSource === "set" ? "Contract value was set by an administrator." : contractSource === "quotation" ? "Contract value is the confirmed quotation total." : "No contract value yet, so profit cannot be calculated."}
          </CardDescription>
        </div>
        {contractControl}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3">
          <Figure label="Contract value" value={contract === null ? "Not set" : formatAmount(c, money(contract))} hint={contractSource === "quotation" ? "From the confirmed quotation" : undefined} />
          <Figure label={done ? "Total spent" : "Spent so far"} value={formatAmount(c, money(spent))} hint={used ? `${used} of the contract value` : undefined} />
          <Figure label={done ? "Profit" : "Profit so far"} value={profit === null ? "—" : formatAmount(c, money(profit))} tone={profit !== null && profit < BigInt(0) ? "bad" : undefined} hint={profit !== null && contract ? `Margin ${percent(profit, contract)}` : undefined} />
          {done ? (
            <Figure label="Paid out" value={formatAmount(c, money(cents(f.paid_out)))} hint={cents(f.paid_out) < spent ? `${formatAmount(c, money(spent - cents(f.paid_out)))} approved but not yet paid` : "All approved spending has been paid"} />
          ) : (
            <Figure label="Projected profit" value={projected === null ? "—" : formatAmount(c, money(projected))} tone={projected !== null && projected < BigInt(0) ? "bad" : undefined} hint={projected !== null && contract ? `Margin ${percent(projected, contract)} after paying the team what is still owed` : "Counts agreed team pay still owed"} />
          )}
        </dl>
        {contract !== null && contract > BigInt(0) && spent >= BigInt(0) && owed >= BigInt(0) && <div className="space-y-2 border-t pt-4">
          <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">Budget use and projected margin</span><span className="tabular-nums text-muted-foreground">Projected margin: {percent(projected!, contract)}</span></div>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-label={`Spent ${percent(spent, contract)} of contract value; team pay still owed ${percent(owed, contract)} of contract value`}>
            <span className="bg-primary" style={{ width: `${Math.min(100, Number(spent * BigInt(10000) / contract) / 100)}%` }} />
            <span className="bg-info" style={{ width: `${Math.min(Math.max(0, 100 - Number(spent * BigInt(10000) / contract) / 100), Number(owed * BigInt(10000) / contract) / 100)}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span><span className="text-primary" aria-hidden="true">●</span> Spent so far</span><span><span className="text-info" aria-hidden="true">●</span> Team pay still owed</span><span>Remaining contract value</span></div>
        </div>}
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {!done && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Paid out so far</dt><dd className="tabular-nums">{formatAmount(c, f.paid_out)}</dd></div>}
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Awaiting approval (not counted)</dt><dd className="tabular-nums">{formatAmount(c, f.pending)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Agreed team pay</dt><dd className="tabular-nums">{formatAmount(c, f.team_agreed)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Team still owed (not yet expensed)</dt><dd className="tabular-nums">{formatAmount(c, money(owed))}</dd></div>
          {contract !== null && !done && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Left in the contract value</dt><dd className="tabular-nums">{formatAmount(c, money(contract - spent))}</dd></div>}
          {invoiced !== null && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Invoiced to client</dt><dd className="tabular-nums">{formatAmount(c, money(invoiced))}</dd></div>}
          {balance !== null && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Still due from client</dt><dd className="tabular-nums">{formatAmount(c, money(balance))}</dd></div>}
        </dl>
        {f.other_currency_spent && <p className="text-sm text-muted-foreground">Also spent in other currencies (not included above): {f.other_currency_spent}.</p>}
      </CardContent>
    </Card>
  );
}
