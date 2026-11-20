import { CreditCardIcon, FileTextIcon, FolderIcon, HeadsetIcon, ReceiptIcon, UserRoundIcon } from "lucide-react";
import type { ReactNode } from "react";
import { readDashboard, type MetricResult } from "@/lib/admin/dashboard";
import type { DashboardMetric } from "@/lib/admin/dashboard-queries";
import { formatMoney, formatNumber } from "@/lib/format";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AttentionStrip, type AttentionEntry } from "@/components/layout/attention-strip";
import { MetricCard, MetricRow } from "@/components/layout/metric-card";

/*
 * Dashboard (Design System V1, Phase 5). Reads are unchanged: readDashboard() checks each metric's
 * permission and reports ready / restricted / error per metric, which the cards and the attention
 * strip display as-is. Nothing is computed client-side and no value is shown as zero when it
 * could not be read.
 */

const cards: { key: DashboardMetric; title: string; note: string; href: string; icon: ReactNode; money?: boolean }[] = [
  { key: "payments", title: "Confirmed payments received", note: "All time, before refunds", href: "/admin/payments?status=confirmed", icon: <CreditCardIcon />, money: true },
  { key: "outstanding", title: "Outstanding invoiced balances", note: "After allocations, credits and reversals", href: "/admin/invoices?status=issued", icon: <ReceiptIcon />, money: true },
  { key: "projects", title: "Active projects", note: "Active, not archived", href: "/admin/projects?status=active", icon: <FolderIcon /> },
  { key: "quotations", title: "Pending quotations", note: "Sent and still valid", href: "/admin/quotations?status=sent", icon: <FileTextIcon /> },
  { key: "leads", title: "New leads", note: "Website leads not yet contacted", href: "/admin/leads?status=new", icon: <UserRoundIcon /> },
  { key: "enquiries", title: "Pending customer enquiries", note: "Customer-care requests awaiting contact", href: "/admin/customer-care", icon: <HeadsetIcon /> },
];

const attention: { key: DashboardMetric; one: string; many: string; href: string; tone: "warning" | "destructive" }[] = [
  { key: "overdueInvoices", one: "overdue invoice with a balance", many: "overdue invoices with a balance", href: "/admin/invoices?payment=overdue", tone: "destructive" },
  { key: "designReviews", one: "design payment awaiting review", many: "design payments awaiting review", href: "/admin/design-purchases?status=payment_submitted", tone: "warning" },
  { key: "enquiries", one: "customer-care request to answer", many: "customer-care requests to answer", href: "/admin/customer-care", tone: "warning" },
  { key: "leads", one: "new lead to contact", many: "new leads to contact", href: "/admin/leads?status=new", tone: "warning" },
];

const count = (result: MetricResult) => (result.state === "ready" ? Number(result.rows[0]?.count ?? 0) : 0);

function metricProps(result: MetricResult, money: boolean | undefined) {
  if (result.state !== "ready") return { state: result.state } as const;
  if (money) {
    return {
      state: "ready" as const,
      values: result.rows.map((row) => ({ key: String(row.currency), value: formatMoney(String(row.currency), row.amount as string) })),
    };
  }
  return { state: "ready" as const, value: formatNumber(count(result)) };
}

export default async function DashboardPage() {
  const metrics = await readDashboard();
  const items: AttentionEntry[] = attention
    .filter(({ key }) => count(metrics[key]) > 0)
    .map(({ key, one, many, href, tone }) => {
      const n = count(metrics[key]);
      return { key, count: n, label: n === 1 ? one : many, href, tone };
    });
  const failed = attention.some(({ key }) => metrics[key].state === "error");
  return (
    <PageContainer>
      <PageHeader title="Dashboard" description="What needs attention across Calacot, and where things stand." />
      <AttentionStrip items={items} failed={failed} />
      {!items.length && !failed && (
        <p className="type-description" role="status">Nothing needs attention right now in the areas you can access.</p>
      )}
      <section aria-labelledby="overview-heading" className="flex flex-col gap-4">
        <h2 id="overview-heading" className="type-section-title">Overview</h2>
        <MetricRow className="xl:grid-cols-3">
          {cards.map((card) => (
            <MetricCard
              key={card.key}
              label={card.title}
              icon={card.icon}
              note={card.note}
              href={card.href}
              hrefLabel={`View ${card.title.toLowerCase()}`}
              {...metricProps(metrics[card.key], card.money)}
            />
          ))}
        </MetricRow>
      </section>
    </PageContainer>
  );
}
