import { readStatementSettings } from "@/lib/statements/reads";
import { decideFsPolicy } from "@/lib/statements/actions";
import { statementLines, type StatementLine } from "@/lib/accounting/statements";
import { AccountingNav } from "@/components/accounting/shared";
import { StatementsNav } from "@/components/statements/shared";
import { ClassificationForm, ProposeOverhead } from "@/components/statements/forms";
import { DecisionForm } from "@/components/tax/controls";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

export default async function Page() {
  const d = await readStatementSettings();
  const { current, proposal } = d.classification;
  const code = (id: string) => d.accounts.find((a) => a.id === id);
  const changes = proposal ? d.accounts.filter((a) => JSON.stringify(proposal.mappings[a.id] ?? null) !== JSON.stringify(current?.mappings[a.id] ?? null)) : [];
  const unclassified = current ? d.accounts.filter((a) => !current.mappings[a.id]) : d.accounts;
  return (
    <PageContainer>
      <PageHeader title="Statement settings" description="How each account is presented in the statements and the cash flow, and how shared costs are allocated to divisions. Each is a versioned policy proposed by one person and approved by another." />
      <AccountingNav current="/admin/accounting/statements" />
      <StatementsNav current="/admin/accounting/statements/classification" />

      <Card>
        <CardHeader>
          <CardTitle as="h2">Statement classification</CardTitle>
          <CardDescription>{current ? `Version ${current.version} approved${current.decided_by ? ` by ${current.decided_by}` : ""}. ${unclassified.length ? `${unclassified.length} account(s) are not classified: activity on them makes statements provisional.` : "Every postable account is classified."}` : "No classification is approved. Every statement is provisional until one is."}</CardDescription>
        </CardHeader>
        {proposal && (
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge domain="fsPolicy" status="proposed" /><span className="text-sm">Version {proposal.version} proposed by {proposal.proposed_by} on {formatDateTime(proposal.proposed_at)}: {proposal.note}</span></div>
            {changes.length > 0 && (
              <div className="overflow-x-auto rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-2">
                <Table>
                  <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Current</TableHead><TableHead>Proposed</TableHead></TableRow></TableHeader>
                  <TableBody>{changes.map((a) => {
                    const f = (m?: { line: string; cashflow: string | null; clearing?: boolean }) => m ? `${statementLines[m.line as StatementLine]?.label ?? m.line}${m.cashflow ? ` · ${m.cashflow}` : ""}${m.clearing ? " · clearing" : ""}` : "Not classified";
                    return <TableRow key={a.id}><TableCell>{a.code} {a.name}</TableCell><TableCell>{f(current?.mappings[a.id])}</TableCell><TableCell>{f(proposal.mappings[a.id])}</TableCell></TableRow>;
                  })}</TableBody>
                </Table>
              </div>
            )}
            <p className="text-sm">Retained earnings account: {code(proposal.retained_earnings_account_id)?.code} {code(proposal.retained_earnings_account_id)?.name}</p>
            {d.can.approve && proposal.proposed_by_id !== d.me
              ? <DecisionForm action={decideFsPolicy} hidden={{ id: proposal.id, entity: "classification" }} label="Classification decision" decisions={[{ value: "approve", label: "Approve classification", primary: true }, { value: "reject", label: "Reject" }]} />
              : <p className="text-sm text-muted-foreground">{proposal.proposed_by_id === d.me ? "You proposed this version; a different person must approve it." : "Awaiting a person with statement approval authority."}</p>}
          </CardContent>
        )}
      </Card>

      {d.can.adjust && !proposal && (
        <Card>
          <CardHeader><CardTitle as="h2">Propose a classification</CardTitle><CardDescription>Choose a statement line and, for accounts that can move cash, the cash-flow class. Mark suspense and clearing accounts so period close checks they are cleared.</CardDescription></CardHeader>
          <CardContent><ClassificationForm accounts={d.accounts} current={current} /></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Overhead allocation</CardTitle>
          <CardDescription>{d.overhead.current ? `Version ${d.overhead.current.version} approved, effective from ${d.overhead.current.effective_from}: ${Object.entries(d.overhead.current.shares).map(([k, v]) => `${k} ${(Number(v) * 100).toFixed(2)}%`).join(", ")}.` : "No allocation policy is approved. Division reports show shared costs as not allocated."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {d.overhead.proposal && (
            <>
              <p className="text-sm">Proposed version {d.overhead.proposal.version} by {d.overhead.proposal.proposed_by}, effective {d.overhead.proposal.effective_from}: {Object.entries(d.overhead.proposal.shares).map(([k, v]) => `${k} ${(Number(v) * 100).toFixed(2)}%`).join(", ")}. {d.overhead.proposal.note}</p>
              {d.can.approve && d.overhead.proposal.proposed_by_id !== d.me && <DecisionForm action={decideFsPolicy} hidden={{ id: d.overhead.proposal.id, entity: "overhead_policy" }} label="Allocation policy decision" decisions={[{ value: "approve", label: "Approve policy", primary: true }, { value: "reject", label: "Reject" }]} />}
            </>
          )}
          {d.can.adjust && !d.overhead.proposal && <div><ProposeOverhead /></div>}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
