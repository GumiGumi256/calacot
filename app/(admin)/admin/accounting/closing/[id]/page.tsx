import Link from "next/link";
import { CheckCircle2Icon, CircleAlertIcon, CircleDashedIcon, ShieldCheckIcon } from "lucide-react";
import { readPeriodClose } from "@/lib/statements/reads";
import { closeCommand, decideCloseException, startClose } from "@/lib/statements/actions";
import { closeCheckLabels } from "@/lib/accounting/statements";
import { AccountingNav } from "@/components/accounting/shared";
import { FsHistory } from "@/components/statements/shared";
import { AssignReviewer, EvidenceForm, ExceptionForm } from "@/components/statements/forms";
import { CommandButton, DecisionForm } from "@/components/tax/controls";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

type Check = { key: string; label: string; status: "pass" | "fail" | "excepted" | "not_applicable"; count: number; detail: unknown[]; exceptable: boolean };
const icon = { pass: CheckCircle2Icon, fail: CircleAlertIcon, excepted: ShieldCheckIcon, not_applicable: CircleDashedIcon };
const iconTone = { pass: "text-success", fail: "text-destructive", excepted: "text-warning", not_applicable: "text-muted-foreground" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await readPeriodClose(id);
  const c = d.live;
  const checks = d.checks.checks as Check[];
  const failing = checks.filter((x) => x.status === "fail" && x.exceptable && !d.exceptions.some((e) => e.check_key === x.key && e.status !== "rejected")).map((x) => x.key);
  const mine = c && (c.prepared_by_id === d.me || c.submitted_by_id === d.me);
  const pendingYearEnd = d.yearEnd?.status === "prepared" && d.isFinal;
  const proposed = d.exceptions.filter((e) => e.status === "proposed").length;
  const nextAction = !c ? (d.period.status === "closed" ? "None: the period is closed." : "Start the close.")
    : c.status === "in_progress" ? (proposed ? `A close approver must decide ${proposed} proposed exception(s).` : d.checks.ready ? "Submit the close for review." : "Resolve the failed checks, or raise exceptions for approval, and record the evidence.")
    : c.status === "submitted" ? (pendingYearEnd ? "Approve the year-end on Period closing." : `Review and approve${c.assigned_reviewer ? ` (assigned to ${c.assigned_reviewer})` : " (a person with close approval authority, not the preparer or submitter)"}.`)
    : c.status === "closed" ? "None: the period is closed." : "Start a new close.";
  return (
    <PageContainer>
      <PageHeader title={`Close ${d.period.name}`} description={`${d.period.start_date} to ${d.period.end_date}. The checklist is computed live from the ledger, banking, assets, tax and source transactions.`}
        meta={<div className="flex flex-wrap gap-2"><StatusBadge domain="period" status={d.period.status} />{c && <StatusBadge domain="periodClose" status={c.status} />}</div>} />
      <AccountingNav current="/admin/accounting/closing" />
      <p className="text-sm"><Link className="underline-offset-4 hover:underline" href={`/admin/accounting/closing?year=${d.period.fiscal_year}`}>All periods of FY{d.period.fiscal_year}</Link></p>

      {!c && d.period.status === "open" && (
        <Card>
          <CardHeader><CardTitle as="h2">Not started</CardTitle><CardDescription>{d.policy ? "Start the close to record evidence and exceptions and submit it for review." : "Approve a close policy first (Period closing)."}</CardDescription></CardHeader>
          {d.can.closeStart && d.policy && <CardContent><CommandButton action={startClose} hidden={{ periodId: d.period.id }} label="Start close" variant="default" /></CardContent>}
        </Card>
      )}

      <Card variant="attention" tone="warning">
        <CardHeader><CardTitle as="h2">Next action</CardTitle><CardDescription>{nextAction}</CardDescription></CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle as="h2">Checklist</CardTitle><CardDescription>{d.checks.ready ? "Every check has passed or has an approved exception." : "Failed checks block the close. Some can stand with an exception approved by a second person; the trial balance, earlier periods and journals awaiting approval cannot."}</CardDescription></CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {checks.map((x) => {
              const Icon = icon[x.status];
              const detail = (x.detail ?? []).map((v) => (typeof v === "string" ? v : Object.values(v as Record<string, unknown>).join(" "))).slice(0, 8);
              return (
                <li key={x.key} className="flex gap-3 text-sm">
                  <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${iconTone[x.status]}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{x.label}</span><StatusBadge domain="closeCheck" status={x.status} /></div>
                    {x.status !== "pass" && x.status !== "not_applicable" && detail.length > 0 && <p className="mt-1 wrap-break-word text-muted-foreground">{detail.join("; ")}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {c && (
        <Card>
          <CardHeader><CardTitle as="h2">Evidence</CardTitle><CardDescription>{d.policy?.evidence_items.length ? `Required: ${d.policy.evidence_items.join(", ")}.` : "No evidence is required by the policy; record any that supports the close."}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {d.evidence.length === 0 ? <p className="text-sm text-muted-foreground">Nothing recorded.</p> : (
              <ul className="flex flex-col gap-2 text-sm">{d.evidence.map((e) => <li key={e.id} className="rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-2"><span className="font-medium">{e.item}</span>: {e.reference}<span className="block text-xs text-muted-foreground">{e.added_by} · {formatDateTime(e.created_at)}{e.note ? ` · ${e.note}` : ""}</span></li>)}</ul>
            )}
            {d.can.closeStart && c.status === "in_progress" && <div><EvidenceForm closeId={c.id} items={d.policy?.evidence_items ?? []} /></div>}
          </CardContent>
        </Card>
      )}

      {c && (
        <Card>
          <CardHeader><CardTitle as="h2">Exceptions</CardTitle><CardDescription>Each exception is explained by the preparer and accepted or rejected by a different person with close approval authority.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {d.exceptions.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : d.exceptions.map((e) => (
              <div key={e.id} className="flex flex-col gap-2 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{closeCheckLabels[e.check_key] ?? e.check_key}</span><StatusBadge domain="fsPolicy" status={e.status} /></div>
                <p>{e.explanation}</p>
                <p className="text-xs text-muted-foreground">Raised by {e.proposed_by}{e.decided_by ? ` · ${e.status} by ${e.decided_by}${e.decision_note ? `: ${e.decision_note}` : ""}` : ""}</p>
                {e.status === "proposed" && d.can.closeApprove && e.proposed_by_id !== d.me && (
                  <DecisionForm action={decideCloseException} hidden={{ id: e.id }} label="Exception decision" notePlaceholder="Note (required)" decisions={[{ value: "approve", label: "Accept exception", primary: true }, { value: "reject", label: "Reject" }]} />
                )}
              </div>
            ))}
            {d.can.closeStart && c.status === "in_progress" && <div><ExceptionForm closeId={c.id} failing={failing} /></div>}
          </CardContent>
        </Card>
      )}

      {c && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Review and approval</CardTitle>
            <CardDescription>Prepared by {c.prepared_by}{c.submitted_by ? ` · submitted by ${c.submitted_by}` : ""}{c.approved_by ? ` · approved by ${c.approved_by} on ${formatDateTime(c.approved_at ?? "")}` : ""}. The approver must be a different person from both the preparer and the submitter; approval re-runs every check and closes the period in the same transaction.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {c.note && <p className="text-sm">Note: {c.note}</p>}
            <p className="text-sm">Assigned reviewer: {c.assigned_reviewer ?? "not assigned (anyone with close approval authority except the preparer and submitter)"}</p>
            {d.can.closeStart && ["in_progress", "submitted"].includes(c.status) && (
              <AssignReviewer closeId={c.id} version={c.version} staff={d.staff} current={c.assigned_reviewer_id} exclude={[c.prepared_by_id, ...(c.submitted_by_id ? [c.submitted_by_id] : [])]} />
            )}
            {c.status === "in_progress" && d.can.closeStart && (
              <DecisionForm action={closeCommand} hidden={{ id: c.id, version: c.version }} label="Close submission" notePlaceholder="Note for the reviewer (optional)"
                decisions={[...(d.checks.ready ? [{ value: "submit", label: "Submit for review", primary: true }] : []), { value: "cancel", label: "Cancel close" }]} />
            )}
            {c.status === "submitted" && pendingYearEnd && <p className="text-sm text-muted-foreground">This is the final period of the year and a year-end is awaiting approval: it is closed by the year-end approval.</p>}
            {c.status === "submitted" && !pendingYearEnd && d.can.closeApprove && !mine && (!c.assigned_reviewer_id || c.assigned_reviewer_id === d.me) && (
              <DecisionForm action={closeCommand} hidden={{ id: c.id, version: c.version }} label="Close decision" notePlaceholder="Note (required to return)"
                decisions={[{ value: "approve", label: "Approve and close period", primary: true }, { value: "return", label: "Return to preparer" }]} />
            )}
            {c.status === "submitted" && mine && <p className="text-sm text-muted-foreground">You prepared or submitted this close, so a different person must approve it.</p>}
            {c.status === "closed" && d.can.reopen && !d.yearEnd && (
              <DecisionForm action={closeCommand} hidden={{ id: c.id, version: c.version }} label="Reopen period" notePlaceholder="Reason for reopening (at least 10 characters)"
                decisions={[{ value: "reopen", label: "Reopen period" }]} />
            )}
            {c.status === "closed" && d.yearEnd?.status === "closed" && <p className="text-sm text-muted-foreground">The financial year is closed. Reopen the year-end before reopening any of its periods.</p>}
          </CardContent>
        </Card>
      )}

      <FsHistory events={d.events} />
    </PageContainer>
  );
}
