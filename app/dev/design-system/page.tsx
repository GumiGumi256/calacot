import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreditCardIcon, PlusIcon, ReceiptIcon, SettingsIcon, WalletIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { TableSkeleton } from "@/components/feedback/skeletons";
import { MetricCard, MetricRow } from "@/components/layout/metric-card";
import { DateRangeFilter } from "@/components/charts/date-range-filter";
import { FilterBar } from "@/components/admin/list-controls";
import { ModeToggle } from "@/components/mode-toggle";
import { statusRegistry, type StatusDomain } from "@/lib/ui/status";
import { formatMoney } from "@/lib/format";
import { SampleMoneyChart } from "./sample-chart";
import { sampleMonthly, sampleQuotations } from "./sample-data";
import { QuotationsTable } from "@/components/sales/quotations-table";
import { MonthlyActivityChart } from "@/components/finance/monthly-activity-chart";
import { PageHeader } from "@/components/layout/page-header";
import { parseQuery } from "@/lib/sales/contracts";

export const metadata: Metadata = { title: "Design system", robots: { index: false, follow: false } };

/**
 * Development-only gallery for Calacot Admin Design System V1 primitives.
 * Renders inside data-surface="admin" so it shows exactly what admin pages get.
 * Returns 404 in production builds. Values here are illustrative, not business data.
 */
export default async function DesignSystemGallery({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const raw = await searchParams;
  const query = parseQuery(raw);
  const view = raw.view === "empty" || raw.view === "filtered" ? raw.view : "rows";
  const rows = view === "rows" ? sampleQuotations.slice(0, query.size) : [];
  return (
    <div data-surface="admin" className="min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 md:px-6">
        <section className="flex flex-col gap-6" aria-label="Quotations table preview">
          <PageHeader
            title="Quotations (table preview)"
            description="Phase 3 DataTable with illustrative rows. Sorting and filters update the URL; rows here do not change."
            secondaryActions={<Button variant="outline"><DownloadIcon /> Export CSV</Button>}
            primaryAction={<Button><PlusIcon /> New quotation</Button>}
          />
          <QuotationsTable
            rows={rows}
            total={view === "rows" ? 312 : 0}
            query={query}
            canCreate
            summary={view === "rows" ? [{ currency: "UGX", total: "418250000" }, { currency: "USD", total: "19642" }] : []}
          />
        </section>
        <Section title="List filters (FilterBar: inline on desktop, bottom sheet on phones)">
          <FilterBar
            fields={[
              { name: "q", label: "Search", type: "search" },
              { name: "status", label: "Status", type: "select", options: ["pending", "approved", "rejected"] },
              { name: "division", label: "Division", type: "select", options: ["painting", "construction", "software"] },
              { name: "from", label: "From", type: "date" },
            ]}
            values={{ status: "approved" }}
            reset="?"
          />
        </Section>
        <section className="flex flex-col gap-4" aria-label="Monthly activity chart preview">
          <h2 className="type-section-title">Financial reports: activity by month (preview)</h2>
          <MonthlyActivityChart rows={sampleMonthly} from="2026-06-01" to="2026-11-30" today="2026-11-19" />
        </section>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="type-page-title">Calacot Admin Design System V1</h1>
            <p className="type-description">Development gallery. Not available in production.</p>
          </div>
          <ModeToggle />
        </header>

        <Section title="Brand colour scales">
          <div className="flex flex-col gap-3">
            {["primary", "black", "white", "lavender", "grey-olive"].map((name) => (
              <div key={name} className="flex flex-col gap-1">
                <span className="type-caption">brand-{name} (base swatch first)</span>
                <div className="grid grid-cols-12 overflow-hidden rounded-lg border">
                  {["", "50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"].map((step) => (
                    <div
                      key={step || "base"}
                      title={`--color-brand-${name}${step ? `-${step}` : ""}`}
                      className="flex h-12 items-end p-1 text-[0.625rem] tabular-nums"
                      style={{
                        background: `var(--color-brand-${name}${step ? `-${step}` : ""})`,
                        color: (step ? Number(step) < 500 : name !== "black") ? "var(--color-brand-black)" : "var(--color-brand-white)",
                      }}
                    >
                      {step || "base"}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button><PlusIcon /> New quotation</Button>
            <Button variant="outline"><DownloadIcon /> Export</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="soft">Soft</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Delete</Button>
            <Button variant="destructive-ghost">Remove</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon-sm" variant="outline" aria-label="Settings"><SettingsIcon /></Button>
            <Button size="icon" variant="outline" aria-label="Settings"><SettingsIcon /></Button>
            <Button size="icon-lg" variant="outline" aria-label="Settings"><SettingsIcon /></Button>
            <Button loading>Saving</Button>
            <Button variant="outline" loading>Exporting</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section title="Status badges">
          <div className="flex flex-col gap-3">
            {(Object.keys(statusRegistry) as StatusDomain[]).map((domain) => (
              <div key={domain} className="flex flex-wrap items-center gap-2">
                <span className="w-32 type-caption">{domain}</span>
                {Object.keys(statusRegistry[domain]).map((s) => <StatusBadge key={s} domain={domain} status={s} />)}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge><Badge variant="secondary">Secondary</Badge><Badge variant="outline">Outline</Badge>
          </div>
        </Section>

        <Section title="Form controls">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5"><Label htmlFor="g-input">Client name</Label><Input id="g-input" placeholder="e.g. Kampala Estates Ltd" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="g-invalid">Amount (UGX)</Label><Input id="g-invalid" aria-invalid defaultValue="12,O00" /><p className="type-caption text-destructive">Enter numbers only.</p></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="g-native">Division</Label><NativeSelect id="g-native" defaultValue="architecture" className="w-full"><option value="">All divisions</option><option value="architecture">Architecture</option><option value="painting">Painting</option></NativeSelect></div>
            <div className="flex flex-col gap-1.5 sm:col-span-3"><Label htmlFor="g-text">Notes</Label><Textarea id="g-text" placeholder="Internal notes" /></div>
          </div>
        </Section>

        <Section title="Metric cards">
          <MetricRow>
            <MetricCard label="Confirmed payments" icon={<CreditCardIcon />} values={[{ key: "UGX", value: formatMoney("UGX", 214_000_000) }, { key: "USD", value: formatMoney("USD", 12_480.5) }]} delta={0.132} note="vs. October" href="#" trend={[151, 176, 171, 189, 214]} />
            <MetricCard label="Outstanding invoices" icon={<ReceiptIcon />} value={formatMoney("UGX", 86_400_000)} delta={0.08} goodWhen="down" note="12 invoices" href="#" />
            <MetricCard label="Expenses awaiting review" icon={<WalletIcon />} state="loading" />
            <MetricCard label="Payment accounts" state="restricted" />
          </MetricRow>
          <MetricRow>
            <MetricCard label="Overdue balances" state="error" />
          </MetricRow>
        </Section>

        <Section title="Cards">
          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardHeader><CardTitle>Default card</CardTitle><CardDescription>Level 1 elevation.</CardDescription></CardHeader><CardContent>Body text.</CardContent></Card>
            <Card variant="attention"><CardHeader><CardTitle>Needs attention</CardTitle><CardDescription>3 payments awaiting verification.</CardDescription></CardHeader><CardContent><Button size="sm">Review payments</Button></CardContent></Card>
            <Card variant="attention" tone="destructive"><CardHeader><CardTitle>Overdue</CardTitle><CardDescription>2 invoices past due.</CardDescription></CardHeader></Card>
            <Card variant="flat"><CardHeader><CardTitle>Flat panel</CardTitle><CardDescription>Nested, no elevation.</CardDescription></CardHeader></Card>
          </div>
        </Section>

        <Section title="Charts">
          <div className="flex justify-end"><Suspense><DateRangeFilter /></Suspense></div>
          <SampleMoneyChart />
          <div className="grid gap-4 lg:grid-cols-2">
            <SampleMoneyChart state="loading" />
            <SampleMoneyChart state="empty" />
            <SampleMoneyChart state="error" />
            <SampleMoneyChart state="restricted" />
          </div>
        </Section>

        <Section title="Empty, error and loading states">
          <div className="grid gap-4 md:grid-cols-2">
            {(["no-records", "no-results", "filtered-out", "restricted"] as const).map((kind) => (
              <Card key={kind}><CardContent><EmptyState kind={kind} query={kind === "no-results" ? "Nakawa" : undefined} action={kind === "no-records" ? <Button size="sm"><PlusIcon /> New client</Button> : kind === "filtered-out" ? <Button size="sm" variant="outline">Clear filters</Button> : undefined} /></CardContent></Card>
            ))}
            <Card className="md:col-span-2"><CardContent><ErrorState /></CardContent></Card>
          </div>
          <TableSkeleton rows={4} />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-section-title">{title}</h2>
      {children}
    </section>
  );
}
