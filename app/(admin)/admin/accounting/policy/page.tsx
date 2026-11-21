import { randomUUID } from "node:crypto";
import { readPolicyPage } from "@/lib/accounting/reads";
import { sourceEvents } from "@/lib/accounting/source-events";
import { monthNames } from "@/lib/accounting/format";
import { AccountingNav } from "@/components/accounting/shared";
import { Decide, ProposePolicy, ProposeRate } from "@/components/accounting/admin-forms";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";

const stageLabels: Record<string, string> = { approval: "Approval only", recognition: "Accounting recognition", settlement: "Settlement", cash: "Cash movement" };

export default async function Page() {
  const d = await readPolicyPage();
  const { policy, proposal, history } = d.readiness;
  return (
    <PageContainer>
      <PageHeader
        title="Policy and rates"
        description="Accountant-approved settings that switch the ledger on, exchange rates entered by people, and the prepared (inactive) mappings from business records to journals."
        primaryAction={d.can.manage && !proposal && <ProposePolicy requestKey={randomUUID()} current={policy} />}
      />
      <AccountingNav current="/admin/accounting/policy" />
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle as="h2">Accounting policy in effect</CardTitle><CardDescription>Changes are proposed by one person and approved by another.</CardDescription></CardHeader>
          <CardContent>
            {policy ? (
              <dl className="grid grid-cols-[11rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Version</dt><dd>{policy.version}</dd>
                <dt className="text-muted-foreground">Functional currency</dt><dd>{policy.functional_currency}</dd>
                <dt className="text-muted-foreground">Financial year starts</dt><dd>{monthNames[policy.fiscal_year_start_month - 1]}</dd>
                <dt className="text-muted-foreground">Manual posting</dt><dd>{policy.manual_posting_enabled ? "Enabled" : "Disabled"}</dd>
                <dt className="text-muted-foreground">Multi-currency posting</dt><dd>Disabled (Phase 2A)</dd>
                <dt className="text-muted-foreground">Automatic posting</dt><dd>Disabled (Phase 2A)</dd>
                <dt className="text-muted-foreground">Approved by</dt><dd>{policy.decided_by}, {formatDateTime(policy.decided_at)}</dd>
                <dt className="text-muted-foreground">Basis</dt><dd className="break-words">{policy.note}</dd>
              </dl>
            ) : <p className="text-sm text-muted-foreground">No policy is approved. The ledger cannot create periods or post anything until one is.</p>}
          </CardContent>
        </Card>
        <Card variant={proposal ? "attention" : "default"} tone="warning">
          <CardHeader><CardTitle as="h2">Pending proposal</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {proposal ? (
              <>
                <p>Version {proposal.version}: functional currency <span className="font-medium">{proposal.functional_currency}</span>, year starting <span className="font-medium">{monthNames[proposal.fiscal_year_start_month - 1]}</span>, manual posting <span className="font-medium">{proposal.manual_posting_enabled ? "enabled" : "disabled"}</span>.</p>
                <p className="text-muted-foreground">Proposed by {proposal.proposed_by}, {formatDateTime(proposal.proposed_at)}: {proposal.note}</p>
                {d.can.approvePolicy && proposal.proposed_by_id !== d.me ? <Decide kind="policy" id={proposal.id} requestKey={randomUUID()} label={`policy version ${proposal.version}`} /> : <p className="text-muted-foreground">{d.can.approvePolicy ? "You proposed this, so someone else must decide." : "Awaiting an authorized approver."}</p>}
              </>
            ) : <p className="text-muted-foreground">No proposal is waiting.</p>}
          </CardContent>
        </Card>
      </div>
      {history.length > 0 && (
        <Card>
          <CardHeader><CardTitle as="h2">Policy history</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Version</TableHead><TableHead>Settings</TableHead><TableHead>Proposed</TableHead><TableHead>Decision</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {history.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.version}</TableCell>
                    <TableCell className="text-sm">{p.functional_currency}, starts {monthNames[p.fiscal_year_start_month - 1]}, posting {p.manual_posting_enabled ? "on" : "off"}</TableCell>
                    <TableCell className="max-w-72 text-xs"><div>{p.proposed_by}, {formatDate(p.proposed_at)}</div><div className="text-muted-foreground break-words">{p.note}</div></TableCell>
                    <TableCell className="max-w-72 text-xs">{p.decided_by ? <><div>{p.decided_by}, {formatDate(p.decided_at)}</div>{p.decision_note && <div className="text-muted-foreground break-words">{p.decision_note}</div>}</> : "—"}</TableCell>
                    <TableCell><StatusBadge domain="accountingProposal" status={p.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle as="h2">Exchange rates</CardTitle>
          <CardDescription>Rates are entered from an approved source and approved by a second person. Approved rates are permanent. Multi-currency posting stays disabled in this phase, so rates are only used on drafts.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {d.can.manage && <div><ProposeRate requestKey={randomUUID()} today={d.readiness.today} functionalCurrency={policy?.functional_currency ?? null} /></div>}
          {d.rates.length === 0 ? <p className="text-sm text-muted-foreground">No exchange rates recorded.</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Pair</TableHead><TableHead className="text-right">Rate</TableHead><TableHead>Date</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Decision</span></TableHead></TableRow></TableHeader>
                <TableBody>
                  {d.rates.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">1 {r.from_currency} = ? {r.to_currency}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.rate}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(r.rate_date)}</TableCell>
                      <TableCell className="max-w-64 text-xs">{r.source}<div className="text-muted-foreground">Entered by {r.entered_by}{r.decided_by ? `; decided by ${r.decided_by}` : ""}</div></TableCell>
                      <TableCell><StatusBadge domain="accountingProposal" status={r.status} /></TableCell>
                      <TableCell className="min-w-56">{r.status === "proposed" && d.can.approvePolicy && r.entered_by_id !== d.me && <Decide kind="rate" id={r.id} requestKey={randomUUID()} label={`${r.from_currency}/${r.to_currency} ${r.rate_date}`} />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Source-to-journal treatments (reference)</CardTitle>
          <CardDescription>The proposed treatment of each business event, for the accountant&apos;s review. The mappings that actually apply are approved under Integration, event mappings. Approval of a business transaction, its accounting recognition and the movement of cash are separate events.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Business event</TableHead><TableHead>Kind</TableHead><TableHead>Proposed treatment</TableHead><TableHead>Approved rule</TableHead></TableRow></TableHeader>
            <TableBody>
              {sourceEvents.map((e) => {
                const rule = d.rules.find((r) => r.source_type === e.type && r.status === "approved");
                return (
                  <TableRow key={e.type}>
                    <TableCell className="min-w-48"><div className="font-medium">{e.label}</div><div className="text-xs text-muted-foreground">{e.record}</div></TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{stageLabels[e.stage]}</TableCell>
                    <TableCell className="min-w-72 text-sm">{e.proposedTreatment}{e.openQuestions.length > 0 && <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">{e.openQuestions.map((q) => <li key={q}>{q}</li>)}</ul>}</TableCell>
                    <TableCell className="text-sm">{rule ? `Version ${rule.version} (inactive)` : "None"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
