import { readTaxSettings } from "@/lib/tax/reads";
import { decideTaxObligation, decideTaxRule } from "@/lib/tax/actions";
import { registrationLabels, ruleKindLabels, taxTypeLabels } from "@/lib/tax/catalog";
import { AccountingNav } from "@/components/accounting/shared";
import { TaxNav } from "@/components/tax/shared";
import { DecisionForm } from "@/components/tax/controls";
import { ProposeObligation, ProposeRule } from "@/components/tax/forms";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";

export default async function Page() {
  const d = await readTaxSettings();
  const codes = [...new Set(d.obligations.map((o) => o.code))];
  return (
    <PageContainer>
      <PageHeader title="Tax settings" description="Calacot's tax registrations and the approved rules used in calculations. Every change is a new version with evidence, approved by a second person. Registration status is never assumed: record only what the evidence shows."
        primaryAction={d.can.managePolicy && <ProposeObligation documents={d.documents} accounts={d.accounts} />}
        secondaryActions={d.can.managePolicy && <ProposeRule documents={d.documents} />} />
      <AccountingNav current="/admin/accounting/tax" />
      <TaxNav current="/admin/accounting/tax/settings" />
      <Card>
        <CardHeader><CardTitle as="h2">Obligations</CardTitle><CardDescription>Only corporate income tax can be operational at present. VAT, withholding tax, PAYE and NSSF can be recorded (for example as pending verification) but cannot calculate or post until separately approved in a later phase.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-6">
          {codes.length === 0 ? <EmptyState kind="no-records" compact title="No obligations recorded" description="Start with corporate income tax: its registration status, evidence, deadlines, calculation rule and accounts." /> : codes.map((code) => {
            const versions = d.obligations.filter((o) => o.code === code);
            const current = versions.find((o) => o.status === "approved") ?? versions[0];
            return (
              <section key={code} aria-labelledby={`ob-${code}`} className="flex flex-col gap-2 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><h3 id={`ob-${code}`} className="font-medium">{current.name}</h3><p className="text-sm text-muted-foreground">{taxTypeLabels[current.tax_type]} · code {code}</p></div>
                  {d.can.managePolicy && <ProposeObligation documents={d.documents} accounts={d.accounts} initialCode={{ code, taxType: current.tax_type, name: current.name }} />}
                </div>
                <ul className="flex flex-col divide-y text-sm">
                  {versions.map((o) => (
                    <li key={o.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:justify-between">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2"><span className="font-medium">Version {o.version}</span><StatusBadge domain="accountingProposal" status={o.status} /><span>{registrationLabels[o.registration_status]}</span><span>{o.processing_enabled ? "· processing enabled" : "· not operational"}</span></p>
                        <p className="text-muted-foreground">{o.taxpayer_name}{o.taxpayer_tin ? ` · TIN ${o.taxpayer_tin}` : ""} · from {formatDate(o.effective_from)} · {o.period_basis.replaceAll("_", " ")} · {o.filing_frequency.replace("_", "-")}</p>
                        <p className="break-words">{o.legal_basis}</p>
                        {o.calculation_rule_code && <p className="text-muted-foreground">Rule {o.calculation_rule_code} · expense {o.expense_account} · payable {o.liability_account}{o.prepayment_account ? ` · prepaid ${o.prepayment_account}` : ""}</p>}
                        {o.deadline_rules.length > 0 && <p className="text-muted-foreground">Deadlines: {o.deadline_rules.map((r) => r.label).join("; ")}</p>}
                        <p className="text-xs text-muted-foreground">Evidence: {o.evidence ?? "none"} · proposed by {o.proposed_by}{o.decided_by ? `; decided by ${o.decided_by}` : ""}{o.decision_note ? `: ${o.decision_note}` : ""}</p>
                      </div>
                      <div className="lg:w-72 lg:shrink-0">
                        {o.status === "proposed" && d.can.approve && (o.proposed_by_id === d.me ? <p className="text-muted-foreground">You proposed this, so someone else must decide.</p>
                          : <DecisionForm action={decideTaxObligation} hidden={{ id: o.id }} label={`Decide ${o.name} version ${o.version}`} decisions={[{ value: "approve", label: "Approve", primary: true }, { value: "reject", label: "Reject" }]} />)}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Tax rules</CardTitle><CardDescription>Rates, bands and capital-allowance classes, each with a legal basis, evidence and an effective date. A newer approved version supersedes the older one, which still applies to earlier dates.</CardDescription></CardHeader>
        <CardContent className="flex flex-col divide-y">
          {d.rules.length === 0 ? <p className="text-sm text-muted-foreground">No rules proposed. No tax can be calculated without an approved rule.</p> : d.rules.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 py-3 first:pt-0 lg:flex-row lg:justify-between">
              <div className="min-w-0 text-sm">
                <p className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.rule_code} v{r.version}</span><StatusBadge domain="accountingProposal" status={r.status} /><span>{ruleKindLabels[r.rule_kind]}</span></p>
                <p>{r.description}</p>
                <p className="font-mono text-xs break-all">{JSON.stringify(r.parameters)}</p>
                <p className="text-muted-foreground">From {formatDate(r.effective_from)}{r.effective_to ? ` to ${formatDate(r.effective_to)}` : ""} · {r.legal_basis}</p>
                <p className="text-xs text-muted-foreground">Evidence: {r.evidence} · proposed by {r.proposed_by}{r.decided_by ? `; decided by ${r.decided_by}` : ""}{r.decision_note ? `: ${r.decision_note}` : ""}</p>
              </div>
              <div className="lg:w-72 lg:shrink-0">
                {d.can.approve && r.status === "proposed" && (r.proposed_by_id === d.me ? <p className="text-sm text-muted-foreground">You proposed this, so someone else must decide.</p>
                  : <DecisionForm action={decideTaxRule} hidden={{ id: r.id }} label={`Decide ${r.rule_code} v${r.version}`} decisions={[{ value: "approve", label: "Approve", primary: true }, { value: "reject", label: "Reject" }]} />)}
                {d.can.approve && r.status === "approved" && <DecisionForm action={decideTaxRule} hidden={{ id: r.id }} label={`Retire ${r.rule_code} v${r.version}`} decisions={[{ value: "retire", label: "Retire" }]} notePlaceholder="Reason for retiring (required)" />}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
