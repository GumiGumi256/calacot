import Link from "next/link";
import { UploadIcon } from "lucide-react";
import { readBankingOverview } from "@/lib/banking/reads";
import { bankingKindLabels, type BankingKind } from "@/lib/banking/catalog";
import { AccountingNav } from "@/components/accounting/shared";
import { BankingNav, Balances, providerBalanceNote } from "@/components/banking/shared";
import { AttentionStrip, type AttentionEntry } from "@/components/layout/attention-strip";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function Page() {
  const d = await readBankingOverview();
  const a = d.attention;
  const items: AttentionEntry[] = [
    { key: "unmapped", label: "accounts without an approved ledger account", count: a.unmapped, href: "/admin/accounting/banking/setup", tone: "warning" as const },
    { key: "mappings", label: "ledger or category mappings awaiting approval", count: a.pendingMappings + a.pendingCategories, href: "/admin/accounting/banking/setup", tone: "warning" as const },
    { key: "review", label: "statement lines awaiting duplicate review", count: a.review, tone: "warning" as const },
    { key: "unmatched", label: "bank lines not yet matched", count: a.unmatched, tone: "warning" as const },
    { key: "cash", label: "cash transactions awaiting approval", count: a.pendingCash, href: "/admin/accounting/banking/cash?status=submitted", tone: "warning" as const },
    { key: "recs", label: "reconciliations awaiting review", count: a.submittedReconciliations.length, href: "/admin/accounting/reconciliation", tone: "warning" as const },
  ].filter((i) => i.count > 0);
  const active = d.accounts.filter((x) => x.status === "active");
  return (
    <PageContainer>
      <PageHeader
        title="Banking & cash"
        description="Company bank, mobile-money, cash and petty cash accounts, their statements and reconciliations. Book balances come from posted journals only; statement balances from imported statements only."
        primaryAction={d.can.importStatements && <Button render={<Link href="/admin/accounting/banking/import" />}><UploadIcon data-icon="inline-start" />Import statement</Button>}
      />
      <AccountingNav current="/admin/accounting/banking" />
      <BankingNav current="/admin/accounting/banking" />
      {d.policy && !d.policy.manual_posting_enabled && (
        <Card variant="attention" tone="warning"><CardContent className="text-sm">Manual posting is disabled in the approved accounting policy. Cash transactions and adjustments can be prepared and approved, but posting will be refused until the policy allows it.</CardContent></Card>
      )}
      <AttentionStrip items={items} />
      {active.length === 0 ? (
        <EmptyState kind="no-records" title="No banking accounts yet" description="Register the company's bank accounts, mobile-money wallets, cash and petty cash, then have a second person approve which ledger account represents each."
          action={d.can.manage ? <Button render={<Link href="/admin/accounting/banking/setup" />}>Set up accounts</Button> : undefined} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {active.map((x) => (
            <Card key={x.id} variant="interactive">
              <CardHeader>
                <CardTitle as="h2"><Link href={`/admin/accounting/banking/${x.id}`} className="hover:underline">{x.label}</Link></CardTitle>
                <CardDescription>
                  {bankingKindLabels[x.kind as BankingKind]}{x.provider ? ` · ${x.provider}` : ""}{x.identifier ? ` · ${x.identifier}` : ""} · {x.currency}
                  {x.custodian ? ` · custodian ${x.custodian}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Balances currency={x.currency} book={x.book_balance} statement={x.statement_balance} statementDate={x.statement_date} reconciled={x.reconciled_balance} reconciledTo={x.reconciled_to} />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {x.ledger_code ? <span className="text-muted-foreground">Ledger {x.ledger_code} {x.ledger_name}</span> : <span className="font-medium text-warning">{x.mapping_pending ? "Ledger mapping awaiting approval" : "No ledger account: cannot be used yet"}</span>}
                  {x.open_reconciliation_status && <StatusBadge domain="bankReconciliation" status={x.open_reconciliation_status} />}
                  {x.unmatched_count > 0 && <Link className="text-warning underline-offset-4 hover:underline" href={`/admin/accounting/banking/${x.id}?view=unmatched`}>{x.unmatched_count} unmatched</Link>}
                  {x.review_count > 0 && <Link className="text-warning underline-offset-4 hover:underline" href={`/admin/accounting/banking/${x.id}?view=review`}>{x.review_count} to review</Link>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{providerBalanceNote} Balances in different currencies are never added together.</p>
    </PageContainer>
  );
}
