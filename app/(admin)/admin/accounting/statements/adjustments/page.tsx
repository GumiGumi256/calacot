import Link from "next/link";
import { readAdjustments } from "@/lib/statements/reads";
import { adjustmentCommand, reverseAdjustment } from "@/lib/statements/actions";
import { AccountingNav } from "@/components/accounting/shared";
import { StatementsNav } from "@/components/statements/shared";
import { AdjustmentForm } from "@/components/statements/forms";
import { CommandButton, DecisionForm } from "@/components/tax/controls";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ledgerAmount } from "@/lib/accounting/format";

const kindLabels: Record<string, string> = { accrual: "Accrual", prepayment: "Prepayment", deferral: "Deferral", provision: "Provision", depreciation: "Depreciation correction", reclassification: "Reclassification", correction: "Error correction", prior_period: "Prior-period correction", other: "Other" };

export default async function Page() {
  const d = await readAdjustments();
  return (
    <PageContainer>
      <PageHeader title="Adjusting entries" description="Accruals, prepayments, reclassifications and corrections, each with a reason and evidence. They are ordinary journals: balanced, dated in an open period, and approved and posted by someone other than the preparer."
        primaryAction={d.can.adjust ? <AdjustmentForm accounts={d.accounts} /> : undefined} />
      <AccountingNav current="/admin/accounting/statements" />
      <StatementsNav current="/admin/accounting/statements/adjustments" />
      {d.adjustments.length === 0 ? <p className="text-sm text-muted-foreground">No adjusting entries have been prepared.</p> : (
        <div className="flex flex-col gap-4">
          {d.adjustments.map((a) => {
            const mine = a.prepared_by_id === d.me;
            const due = a.auto_reverse_on && !a.reversal_number && a.journal_status === "posted" && a.auto_reverse_on <= d.today;
            return (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle as="h2"><Link className="underline-offset-4 hover:underline" href={`/admin/accounting/journals/${a.journal_id}`}>{a.number ?? "Unnumbered"}</Link> · {kindLabels[a.kind] ?? a.kind}</CardTitle>
                  <CardDescription>{a.entry_date} · {a.description} · {ledgerAmount(a.total)} · prepared by {a.prepared_by}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge domain="journal" status={a.journal_status} />{a.prior_period && <span className="text-xs text-warning">Prior-period correction (shown separately in equity)</span>}</div>
                  <p><span className="font-medium">Reason:</span> {a.reason}</p>
                  <p><span className="font-medium">Evidence:</span> {a.evidence_reference}</p>
                  {a.auto_reverse_on && <p>Reverses on {a.auto_reverse_on}{a.reversal_number ? `: reversed by ${a.reversal_number}` : ""}</p>}
                  {a.replaces_number && <p>Corrects {a.replaces_number}</p>}
                  {d.can.review && !mine && a.journal_status === "submitted" && (
                    <DecisionForm action={adjustmentCommand} hidden={{ id: a.id, version: a.journal_version }} label={`Review adjustment ${a.description}`}
                      decisions={[{ value: "approve", label: "Approve", primary: true }, { value: "return", label: "Return" }, { value: "reject", label: "Reject" }]} />
                  )}
                  {d.can.review && !mine && a.journal_status === "approved" && <CommandButton action={adjustmentCommand} hidden={{ id: a.id, version: String(a.journal_version), cmd: "post" }} label="Post to ledger" variant="default" />}
                  {mine && ["submitted", "approved"].includes(a.journal_status) && <p className="text-muted-foreground">Awaiting another person&apos;s review.</p>}
                  {a.journal_status === "draft" && <p className="text-muted-foreground">Returned: edit and resubmit the journal from the <Link className="underline" href={`/admin/accounting/journals/${a.journal_id}`}>journal page</Link>.</p>}
                  {d.can.adjust && due && <CommandButton action={reverseAdjustment} hidden={{ id: a.id }} label="Post scheduled reversal" />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
