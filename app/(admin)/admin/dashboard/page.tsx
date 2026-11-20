import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readDashboard, type MetricResult } from "@/lib/admin/dashboard";
import type { DashboardMetric } from "@/lib/admin/dashboard-queries";

const cards: { key: DashboardMetric; title: string; description: string; href: string; money?: boolean }[] = [
  { key: "payments", title: "Confirmed payments received", description: "All confirmed payments, before refunds. Grouped by currency.", href: "/admin/payments", money: true },
  { key: "outstanding", title: "Outstanding invoiced balances", description: "Issued invoices after confirmed allocations, issued credits and completed reversals.", href: "/admin/invoices", money: true },
  { key: "projects", title: "Active projects", description: "Active, non-archived projects.", href: "/admin/projects" },
  { key: "quotations", title: "Pending quotations", description: "Latest versions sent and still within their validity period.", href: "/admin/quotations" },
  { key: "leads", title: "New leads", description: "New website leads in the existing leads register.", href: "/admin/leads" },
  { key: "enquiries", title: "Pending customer enquiries", description: "New customer-care requests awaiting contact.", href: "/admin/customer-care" },
];

const attention: { key: DashboardMetric; label: string; href: string }[] = [
  { key: "leads", label: "New leads to contact", href: "/admin/leads?status=new" },
  { key: "enquiries", label: "New customer-care requests", href: "/admin/customer-care" },
  { key: "overdueInvoices", label: "Overdue invoices with a balance", href: "/admin/invoices?payment=overdue" },
  { key: "designReviews", label: "Design payments awaiting review", href: "/admin/design-purchases?status=payment_submitted" },
];

function NeedsAttention({ metrics }: { metrics: Record<DashboardMetric, MetricResult> }) {
  const available = attention.filter(({ key }) => metrics[key].state === "ready");
  const actionable = available.filter(({ key }) => {
    const result = metrics[key];
    return result.state === "ready" && Number(result.rows[0]?.count) > 0;
  });
  const hasErrors = attention.some(({ key }) => metrics[key].state === "error");
  return <section aria-labelledby="needs-attention"><Card><CardHeader>
    <CardTitle id="needs-attention">Needs attention</CardTitle>
    <CardDescription>Open items that may need staff follow-up.</CardDescription>
  </CardHeader><CardContent>
    {actionable.length > 0 ? <ul className="divide-y">{actionable.map(({ key, label, href }) => {
      const result = metrics[key];
      return result.state === "ready" && <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><span><span className="font-semibold tabular-nums">{String(result.rows[0]?.count)}</span> {label.toLowerCase()}</span><Link href={href} className="text-sm font-medium underline underline-offset-4">Review <span className="sr-only">{label.toLowerCase()}</span></Link></li>;
    })}</ul> : <p className="text-sm text-muted-foreground">{available.length ? "No open items in the categories you can access." : "No attention categories are available for your role."}</p>}
    {hasErrors && <p role="status" className="mt-3 text-sm text-destructive">Some items could not be checked. Refresh to try again.</p>}
  </CardContent></Card></section>;
}

function Value({ result, money }: { result: MetricResult; money?: boolean }) {
  if (result.state === "restricted") return <p className="text-sm text-muted-foreground">Unavailable for your role.</p>;
  if (result.state === "error") return <p className="text-sm text-destructive" role="status">Could not load this metric. Refresh to try again.</p>;
  if (money) return result.rows.length ? <ul className="space-y-1 text-xl font-semibold tabular-nums">{result.rows.map(row => <li key={String(row.currency)}>{String(row.currency)} {String(row.amount)}</li>)}</ul> : <p className="text-sm text-muted-foreground">No records yet.</p>;
  return <p className="text-2xl font-semibold tabular-nums">{String(result.rows[0]?.count ?? 0)}</p>;
}

export default async function DashboardPage() {
  const metrics = await readDashboard();
  return <div className="flex flex-col gap-6 p-4 md:p-6">
    <div><h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Current activity across Calacot.</p></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map(card => <Card key={card.key} className="min-w-0"><CardHeader><CardTitle>{card.title}</CardTitle><CardDescription>{card.description}</CardDescription></CardHeader><CardContent className="space-y-4"><Value result={metrics[card.key]} money={card.money} />{metrics[card.key].state === "ready" && <Link className="inline-block text-sm font-medium underline underline-offset-4" href={card.href}>View {card.title.toLowerCase()}</Link>}</CardContent></Card>)}
    </div>
    <NeedsAttention metrics={metrics} />
  </div>;
}
