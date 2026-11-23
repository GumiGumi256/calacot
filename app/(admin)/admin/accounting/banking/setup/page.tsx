import Link from "next/link";
import { readBankingSetup } from "@/lib/banking/reads";
import { bankingKindLabels, categories, categoryLabels, type BankingKind, type Category } from "@/lib/banking/catalog";
import { AccountingNav } from "@/components/accounting/shared";
import { BankingNav } from "@/components/banking/shared";
import { AccountSettings, DecideCategory, DecideMapping, ProposeCategory, ProposeMapping, RegisterAccount } from "@/components/banking/forms";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";

export default async function Page() {
  const d = await readBankingSetup();
  const staff = d.staff.map((s) => ({ id: s.id, label: s.name }));
  const approvedCats = new Set(d.categories.filter((c) => c.status === "approved").map((c) => c.category));
  return (
    <PageContainer>
      <PageHeader
        title="Accounts and mappings"
        description="Which company money accounts exist and which general-ledger account represents each. Finance proposes; a different person with policy-approval authority approves. Nothing here moves money or posts entries."
        primaryAction={d.can.manage && <RegisterAccount financeAccounts={d.financeAccounts} staff={staff} />}
      />
      <AccountingNav current="/admin/accounting/banking" />
      <BankingNav current="/admin/accounting/banking/setup" />
      <Card>
        <CardHeader><CardTitle as="h2">Company accounts</CardTitle><CardDescription>Bank and mobile-money accounts come from the verified <Link className="underline underline-offset-4" href="/admin/payment-accounts">Payment accounts</Link> register. Full account numbers are never shown.</CardDescription></CardHeader>
        <CardContent className="flex flex-col divide-y">
          {d.accounts.length === 0 ? <EmptyState kind="no-records" compact title="No accounts registered" description="Register each bank account, MTN and Airtel wallet, cash box and petty cash float." /> : d.accounts.map((a) => (
            <div key={a.id} className="flex flex-col gap-3 py-4 first:pt-0 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 flex-col gap-1 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Link className="font-medium hover:underline" href={`/admin/accounting/banking/${a.id}`}>{a.label}</Link><StatusBadge domain="bankingAccount" status={a.status} /></div>
                <p className="text-muted-foreground">{bankingKindLabels[a.kind as BankingKind]}{a.provider ? ` · ${a.provider}` : ""}{a.identifier ? ` · ${a.identifier}` : ""} · {a.currency}{a.custodian ? ` · custodian ${a.custodian}` : ""}{a.float_amount ? ` · float ${a.float_amount}` : ""}</p>
                <p>{a.ledger_code ? <>Ledger account <span className="font-medium">{a.ledger_code} {a.ledger_name}</span></> : <span className="text-warning">{a.mapping_pending ? "Ledger mapping awaiting approval" : "No ledger account yet"}</span>}</p>
              </div>
              <div className="flex flex-wrap gap-2 lg:shrink-0">
                {d.can.manage && a.status === "active" && !a.ledger_id && !a.mapping_pending && <ProposeMapping accountId={a.id} accountLabel={a.label} currency={a.currency} ledgers={d.ledgers} />}
                {d.can.manage && <AccountSettings account={a} staff={staff} />}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Ledger mappings</CardTitle><CardDescription>History is kept forever. An approved mapping is only ever retired, never edited.</CardDescription></CardHeader>
        <CardContent className="flex flex-col divide-y">
          {d.mappings.length === 0 ? <p className="text-sm text-muted-foreground">No mappings proposed yet.</p> : d.mappings.map((m) => (
            <div key={m.id} className="flex flex-col gap-2 py-3 first:pt-0 lg:flex-row lg:justify-between">
              <div className="flex min-w-0 flex-col gap-1 text-sm">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{m.account_label} → {m.ledger_code} {m.ledger_name}</span><StatusBadge domain="accountingProposal" status={m.status} /></div>
                <p className="break-words">{m.note}</p>
                <p className="text-xs text-muted-foreground">Proposed by {m.proposed_by}, {formatDate(m.proposed_at)}{m.decided_by ? `; decided by ${m.decided_by}, ${formatDate(m.decided_at)}` : ""}{m.decision_note ? `: ${m.decision_note}` : ""}{m.retire_reason ? `; retired: ${m.retire_reason}` : ""}</p>
              </div>
              <div className="lg:w-72 lg:shrink-0">
                {d.can.approveMapping && m.status === "proposed" && (m.proposed_by_id === d.me ? <p className="text-sm text-muted-foreground">You proposed this, so someone else must decide.</p> : <DecideMapping id={m.id} status={m.status} label={`${m.account_label} mapping`} />)}
                {d.can.approveMapping && m.status === "approved" && <DecideMapping id={m.id} status={m.status} label={`${m.account_label} mapping`} />}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><CardTitle as="h2">Adjustment category accounts</CardTitle><CardDescription>Bank charges, interest, cash shortages and overages, and staff advances can only be prepared once their account is approved.</CardDescription></div>
            {d.can.manage && <ProposeCategory accounts={d.categoryAccounts} />}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => <li key={c} className="flex items-center justify-between gap-2 rounded-(--card-radius-inner) border border-card-edge bg-card-nested px-3 py-2"><span>{categoryLabels[c]}</span>{approvedCats.has(c) ? <StatusBadge domain="accountingProposal" status="approved" /> : <span className="text-xs text-warning">Not approved</span>}</li>)}
          </ul>
          <div className="flex flex-col divide-y">
            {d.categories.map((c) => (
              <div key={c.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:justify-between">
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{categoryLabels[c.category as Category]} → {c.ledger_code} {c.ledger_name}</span><StatusBadge domain="accountingProposal" status={c.status} /></div>
                  <p className="break-words">{c.note}</p>
                  <p className="text-xs text-muted-foreground">Proposed by {c.proposed_by}, {formatDate(c.proposed_at)}{c.decided_by ? `; decided by ${c.decided_by}` : ""}{c.decision_note ? `: ${c.decision_note}` : ""}</p>
                </div>
                <div className="lg:w-72 lg:shrink-0">
                  {d.can.approveMapping && c.status === "proposed" && (c.proposed_by_id === d.me ? <p className="text-sm text-muted-foreground">You proposed this, so someone else must decide.</p> : <DecideCategory id={c.id} status={c.status} label={categoryLabels[c.category as Category]} />)}
                  {d.can.approveMapping && c.status === "approved" && <DecideCategory id={c.id} status={c.status} label={categoryLabels[c.category as Category]} />}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
