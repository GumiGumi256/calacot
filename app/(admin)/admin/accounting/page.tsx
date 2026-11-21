import Link from "next/link";
import { readOverview } from "@/lib/accounting/reads";
import { ledgerAmount } from "@/lib/accounting/format";
import { AccountingNav, ReadinessPanel } from "@/components/accounting/shared";
import { JournalTable } from "@/components/accounting/journal-table";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AttentionStrip, type AttentionEntry } from "@/components/layout/attention-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";

export default async function Page() {
  const d = await readOverview();
  const attention: AttentionEntry[] = [
    d.can.approve && d.counts.submitted ? { key: "review", count: d.counts.submitted, label: "Journals awaiting approval", href: "/admin/accounting/journals?view=review", tone: "warning" as const } : null,
    d.can.post && d.counts.approved ? { key: "ready", count: d.counts.approved, label: "Approved journals not yet posted", href: "/admin/accounting/journals?view=ready", tone: "warning" as const } : null,
    d.readiness.accounts.proposed ? { key: "accounts", count: d.readiness.accounts.proposed, label: "Accounts awaiting approval", href: "/admin/accounting/accounts?status=proposed", tone: "warning" as const } : null,
    d.readiness.proposal ? { key: "policy", count: 1, label: "Accounting policy proposal awaiting a decision", href: "/admin/accounting/policy", tone: "warning" as const } : null,
  ].filter((x) => x !== null);
  return (
    <PageContainer>
      <PageHeader
        title="Accounting"
        description="Double-entry general ledger. Balances come only from posted journals; invoices, payments and expenses are not posted automatically."
        primaryAction={d.can.prepare && <Button render={<Link href="/admin/accounting/journals/new" />}>New journal</Button>}
      />
      <AccountingNav current="/admin/accounting" />
      <AttentionStrip items={attention} />
      <ReadinessPanel readiness={d.readiness} />
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card className="min-w-0">
          <CardHeader><CardTitle as="h2">Recent journals</CardTitle><CardDescription>Latest changes, including drafts. Drafts never affect balances.</CardDescription></CardHeader>
          <CardContent>
            {d.recent.length ? <JournalTable rows={d.recent} /> : <EmptyState kind="no-records" compact title="No journals yet" description={d.can.prepare ? "Create the first manual journal draft." : "Journals appear here once finance staff prepare them."} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">Trial balance today</CardTitle>
            <CardDescription>Posted journals only, in functional currency.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {d.trialBalance.length === 0 ? <p className="text-muted-foreground">Nothing has been posted.</p> : d.trialBalance.map((t) => (
              <dl key={t.currency} className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
                <dt className="text-muted-foreground">Accounts with activity</dt><dd className="text-right">{t.accounts}</dd>
                <dt className="text-muted-foreground">Debit balances ({t.currency})</dt><dd className="text-right">{ledgerAmount(t.closing_debit)}</dd>
                <dt className="text-muted-foreground">Credit balances ({t.currency})</dt><dd className="text-right">{ledgerAmount(t.closing_credit)}</dd>
                <dt className="font-medium">Status</dt><dd className={t.balanced ? "text-right text-success" : "text-right font-medium text-destructive"}>{t.balanced ? "Balanced" : "Out of balance"}</dd>
              </dl>
            ))}
            <Button variant="outline" size="sm" render={<Link href="/admin/accounting/trial-balance" />}>Open trial balance</Button>
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">Formal financial statements are not produced in this phase: they need approved accounting policies and transaction mappings first.</p>
    </PageContainer>
  );
}
