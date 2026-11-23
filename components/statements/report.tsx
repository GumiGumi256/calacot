import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ledgerAmount } from "@/lib/accounting/format";
import { assetLineOrder, equityLineOrder, incomeLineOrder, liabilityLineOrder, statementLines, type ReportType, type StatementLine } from "@/lib/accounting/statements";
import type { Json } from "@/lib/statements/reads";

type Range = { from: string; to: string };
type Line = { accountId: string; code: string; name: string; amount: string };

/**
 * Renders one statement computed by the database. Amounts are displayed exactly as returned. Each
 * account row links to its ledger for the same dates (statement → account → journal drill-down).
 */
export function StatementReport({ report, current, comparative, range, compareRange, drill = true }: {
  report: ReportType; current: Json; comparative?: Json | null; range: Range; compareRange?: Range | null; drill?: boolean;
}) {
  const props = { current, comparative: comparative ?? null, range, compareRange: compareRange ?? null, drill };
  switch (report) {
    case "income": return <IncomeStatement {...props} />;
    case "balance": return <BalanceSheet {...props} />;
    case "cashflow": return <CashFlow {...props} />;
    case "equity": return <Equity {...props} />;
    case "trial": return <TrialBalance current={current} range={range} drill={drill} />;
    case "divisions": return <Divisions current={current} />;
    default: return <Projects current={current} />;
  }
}

type P = { current: Json; comparative: Json | null; range: Range; compareRange: Range | null; drill: boolean };

const amt = (v: unknown) => ledgerAmount(v === null || v === undefined ? "0" : String(v));
function Head({ label, p }: { label: string; p: P }) {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>{label}</TableHead>
        <TableHead className="text-right">{p.range.from} – {p.range.to}</TableHead>
        {p.comparative && <TableHead className="text-right">{p.compareRange?.from} – {p.compareRange?.to}</TableHead>}
      </TableRow>
    </TableHeader>
  );
}
function Row({ label, value, compare, p, strong, indent, href }: { label: string; value: unknown; compare?: unknown; p: P; strong?: boolean; indent?: boolean; href?: string }) {
  return (
    <TableRow className={strong ? "font-medium" : undefined}>
      <TableCell className={indent ? "pl-6" : undefined}>{href && p.drill ? <Link className="underline-offset-4 hover:underline" href={href}>{label}</Link> : label}</TableCell>
      <TableCell className="text-right tabular-nums">{amt(value)}</TableCell>
      {p.comparative && <TableCell className="text-right tabular-nums">{amt(compare)}</TableCell>}
    </TableRow>
  );
}
const ledgerHref = (id: string, r: Range) => `/admin/accounting/accounts/${id}?from=${r.from}&to=${r.to}`;

function LineGroup({ line, p, asOf }: { line: StatementLine; p: P; asOf?: boolean }) {
  const cur: Line[] = p.current.lines?.[line] ?? [];
  const cmp: Line[] = p.comparative?.lines?.[line] ?? [];
  const ids = [...new Set([...cur.map((l) => l.accountId), ...cmp.map((l) => l.accountId)])];
  if (!ids.length) return null;
  const byId = (arr: Line[], id: string) => arr.find((l) => l.accountId === id);
  const r = asOf ? { from: "1900-01-01", to: p.range.to } : p.range;
  return (
    <>
      <Row label={statementLines[line].label} value={p.current.lineTotals?.[line] ?? "0"} compare={p.comparative?.lineTotals?.[line] ?? "0"} p={p} strong />
      {ids.map((id) => { const a = byId(cur, id) ?? byId(cmp, id)!; return <Row key={id} label={`${a.code} ${a.name}`} value={byId(cur, id)?.amount ?? "0"} compare={byId(cmp, id)?.amount ?? "0"} p={p} indent href={ledgerHref(id, r)} />; })}
    </>
  );
}

function Unmapped({ items }: { items: Line[] | undefined }) {
  if (!items?.length) return null;
  return (
    <div role="alert" className="mt-3 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-3 text-sm">
      <p className="font-medium text-warning">Provisional: accounts with activity are not classified for the statements</p>
      <ul className="mt-1 list-disc pl-5">{items.map((u) => <li key={u.accountId}>{u.code} {u.name}: {amt(u.amount)}</li>)}</ul>
    </div>
  );
}

function IncomeStatement({ ...p }: P) {
  const c = p.current, k = p.comparative;
  const sub = (label: string, key: string) => <Row label={label} value={c[key]} compare={k?.[key]} p={p} strong />;
  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs text-muted-foreground">Income is shown as positive amounts and costs as negative amounts.{c.division ? ` Division: ${c.division}.` : ""}</p>
      <Table>
        <Head label="Income statement" p={p} />
        <TableBody>
          <LineGroup line="revenue" p={p} />
          <LineGroup line="cost_of_sales" p={p} />
          {sub("Gross profit", "grossProfit")}
          <LineGroup line="operating_expenses" p={p} />
          {sub("Operating profit", "operatingProfit")}
          {incomeLineOrder.slice(3, 6).map((l) => <LineGroup key={l} line={l} p={p} />)}
          {(Number(c.unclassified ?? 0) !== 0 || Number(k?.unclassified ?? 0) !== 0) && <Row label="Unclassified accounts (provisional)" value={c.unclassified} compare={k?.unclassified} p={p} strong />}
          {sub("Profit before tax", "profitBeforeTax")}
          <LineGroup line="income_tax" p={p} />
          {sub("Profit for the period", "netProfit")}
        </TableBody>
      </Table>
      <Unmapped items={c.unmapped} />
    </div>
  );
}

function BalanceSheet({ ...p }: P) {
  const c = p.current, k = p.comparative;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow><TableHead>Balance sheet</TableHead><TableHead className="text-right">As at {p.range.to}</TableHead>{k && <TableHead className="text-right">As at {p.compareRange?.to}</TableHead>}</TableRow>
        </TableHeader>
        <TableBody>
          {assetLineOrder.map((l) => <LineGroup key={l} line={l} p={p} asOf />)}
          <Row label="Total assets" value={c.totalAssets} compare={k?.totalAssets} p={p} strong />
          {liabilityLineOrder.map((l) => <LineGroup key={l} line={l} p={p} asOf />)}
          <Row label="Total liabilities" value={c.totalLiabilities} compare={k?.totalLiabilities} p={p} strong />
          {equityLineOrder.map((l) => <LineGroup key={l} line={l} p={p} asOf />)}
          <Row label="Results not yet closed to retained earnings" value={c.currentPeriodResults} compare={k?.currentPeriodResults} p={p} />
          <Row label="Total equity" value={c.totalEquity} compare={k?.totalEquity} p={p} strong />
          <Row label="Total liabilities and equity" value={c.totalLiabilitiesAndEquity} compare={k?.totalLiabilitiesAndEquity} p={p} strong />
        </TableBody>
      </Table>
      {Number(c.difference) !== 0 && (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">Assets do not equal liabilities plus equity: difference {amt(c.difference)}. These statements cannot be approved until the cause is found. No balancing figure is added.</p>
      )}
      <Unmapped items={c.unmapped} />
    </div>
  );
}

function CashFlow({ ...p }: P) {
  const c = p.current, k = p.comparative;
  const section = (key: "operating" | "investing" | "financing", label: string) => {
    const names = [...new Set([...Object.keys(c.detail?.[key] ?? {}), ...Object.keys(k?.detail?.[key] ?? {})])].sort();
    return (
      <>
        {names.map((n) => <Row key={n} label={n} value={c.detail?.[key]?.[n] ?? "0"} compare={k?.detail?.[key]?.[n] ?? "0"} p={p} indent />)}
        <Row label={label} value={c[key]} compare={k?.[key]} p={p} strong />
      </>
    );
  };
  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs text-muted-foreground">Direct method: each cash movement is classified by the approved class of its counterpart account. Transfers between Calacot&apos;s own cash and bank accounts are excluded ({amt(c.internalTransfers)} in this period).</p>
      <Table>
        <Head label="Cash flow statement" p={p} />
        <TableBody>
          <Row label="Cash and cash equivalents at the start" value={c.openingCash} compare={k?.openingCash} p={p} strong />
          {section("operating", "Net cash from operating activities")}
          {section("investing", "Net cash from investing activities")}
          {section("financing", "Net cash from financing activities")}
          {Number(c.unclassifiedTotal) !== 0 && <Row label="Unclassified cash movements" value={c.unclassifiedTotal} compare={k?.unclassifiedTotal} p={p} />}
          <Row label="Cash and cash equivalents at the end" value={c.closingCash} compare={k?.closingCash} p={p} strong />
        </TableBody>
      </Table>
      {!c.reconciles && <p role="alert" className="mt-3 text-sm font-medium text-destructive">Opening cash plus movements does not equal closing cash. The statement cannot be approved.</p>}
      {c.unreconciledAccounts?.length > 0 && <p className="mt-3 text-sm text-warning">Provisional: bank reconciliation not finalized to {p.range.to} for {c.unreconciledAccounts.join(", ")}.</p>}
      <Unmapped items={c.unclassified} />
    </div>
  );
}

function Equity({ ...p }: P) {
  const c = p.current, k = p.comparative;
  const rows: [string, string, boolean?][] = [["Equity at the start", "openingEquity", true], ["Capital introduced", "capitalIntroduced"], ["Dividends and drawings", "distributions"], ["Profit for the period", "profitForPeriod"],
    ["Prior-period corrections", "priorPeriodCorrections"], ["Other movements", "otherMovements"], ["Equity at the end", "closingEquity", true]];
  return (
    <div className="overflow-x-auto">
      <Table>
        <Head label="Changes in equity" p={p} />
        <TableBody>{rows.map(([l, key, s]) => <Row key={key} label={l} value={c[key]} compare={k?.[key]} p={p} strong={s} />)}</TableBody>
      </Table>
      <p className="mt-2 text-xs text-muted-foreground">Year-end transfers of the result to retained earnings in this period: {amt(c.yearEndTransfers)} (a movement within equity).</p>
      {!c.reconciles && <p role="alert" className="mt-3 text-sm font-medium text-destructive">Equity movements do not reconcile to the ledger.</p>}
    </div>
  );
}

function TrialBalance({ current, range, drill }: { current: Json; range: Range; drill: boolean }) {
  const t = current.totals;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Opening Dr</TableHead><TableHead className="text-right">Opening Cr</TableHead><TableHead className="text-right">Debits</TableHead><TableHead className="text-right">Credits</TableHead><TableHead className="text-right">Closing Dr</TableHead><TableHead className="text-right">Closing Cr</TableHead></TableRow></TableHeader>
        <TableBody>
          {current.rows.map((r: Json) => (
            <TableRow key={r.accountId}>
              <TableCell>{drill ? <Link className="underline-offset-4 hover:underline" href={ledgerHref(r.accountId, range)}>{r.code} {r.name}</Link> : `${r.code} ${r.name}`}</TableCell>
              {["openingDebit", "openingCredit", "debit", "credit", "closingDebit", "closingCredit"].map((k) => <TableCell key={k} className="text-right tabular-nums">{ledgerAmount(String(r[k]), { blankZero: true })}</TableCell>)}
            </TableRow>
          ))}
          <TableRow className="font-medium"><TableCell>Totals</TableCell>{["openingDebit", "openingCredit", "debit", "credit", "closingDebit", "closingCredit"].map((k) => <TableCell key={k} className="text-right tabular-nums">{amt(t[k])}</TableCell>)}</TableRow>
        </TableBody>
      </Table>
      <p className={current.balanced ? "mt-2 text-sm text-success" : "mt-2 text-sm font-medium text-destructive"} role={current.balanced ? undefined : "alert"}>{current.balanced ? "Debits equal credits." : "The trial balance does not agree."}</p>
    </div>
  );
}

function Divisions({ current }: { current: Json }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow><TableHead>Division</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Gross profit</TableHead><TableHead className="text-right">Direct operating costs</TableHead><TableHead className="text-right">Result</TableHead>{current.allocated && <><TableHead className="text-right">Share</TableHead><TableHead className="text-right">Allocated overhead</TableHead><TableHead className="text-right">After allocation</TableHead></>}</TableRow></TableHeader>
        <TableBody>
          {current.divisions.map((d: Json) => (
            <TableRow key={d.division}>
              <TableCell className="capitalize">{d.division}</TableCell>
              <TableCell className="text-right tabular-nums">{amt(d.revenue)}</TableCell><TableCell className="text-right tabular-nums">{amt(d.grossProfit)}</TableCell>
              <TableCell className="text-right tabular-nums">{amt(d.operatingExpenses)}</TableCell><TableCell className="text-right tabular-nums">{amt(d.netProfit)}</TableCell>
              {current.allocated && <><TableCell className="text-right tabular-nums">{d.share ? `${(Number(d.share) * 100).toFixed(2)}%` : "—"}</TableCell><TableCell className="text-right tabular-nums">{amt(d.allocatedOverhead)}</TableCell><TableCell className="text-right tabular-nums">{amt(d.netAfterAllocation)}</TableCell></>}
            </TableRow>
          ))}
          <TableRow><TableCell>Not assigned to a division (shared)</TableCell><TableCell className="text-right tabular-nums">{amt(current.unassignedRevenue)}</TableCell><TableCell /><TableCell className="text-right tabular-nums">{amt(current.sharedOperatingExpenses)}</TableCell><TableCell className="text-right tabular-nums">{amt(current.sharedNet)}</TableCell>{current.allocated && <><TableCell /><TableCell /><TableCell /></>}</TableRow>
          <TableRow className="font-medium"><TableCell>Total</TableCell><TableCell /><TableCell /><TableCell /><TableCell className="text-right tabular-nums">{amt(current.totalNetProfit)}</TableCell>{current.allocated && <><TableCell /><TableCell /><TableCell /></>}</TableRow>
        </TableBody>
      </Table>
      <p className="mt-2 text-xs text-muted-foreground">{current.allocated ? `Shared operating costs allocated as a memo under approved policy version ${current.allocationPolicyVersion}. Allocation never posts journals.` : "Shared costs are not allocated: no approved allocation policy covers this period."}</p>
    </div>
  );
}

function Projects({ current }: { current: Json }) {
  if (!current.projects.length) return <p className="text-sm text-muted-foreground">No posted entries carry a project in this period.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow><TableHead>Project</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Cost of sales</TableHead><TableHead className="text-right">Gross profit</TableHead><TableHead className="text-right">Other costs</TableHead><TableHead className="text-right">Result</TableHead></TableRow></TableHeader>
        <TableBody>{current.projects.map((d: Json) => <TableRow key={d.projectId}><TableCell>{d.name}</TableCell>{["revenue", "costOfSales", "grossProfit", "operatingExpenses", "netProfit"].map((k) => <TableCell key={k} className="text-right tabular-nums">{amt(d[k])}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
      <p className="mt-2 text-xs text-muted-foreground">Only entries tagged with a project. Shared costs are not allocated to projects.</p>
    </div>
  );
}
