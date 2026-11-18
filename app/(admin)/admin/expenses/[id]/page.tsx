import Link from "next/link";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { readExpenseDetail } from "@/lib/finance/expenses";
import { disbursementMethodLabels, expenseStatusHelp, expenseStatusLabels, formatAmount } from "@/lib/finance/options";
import { AmountBreakdown, ExpenseStatusBadge } from "@/components/finance/expense-status";
import { DisbursementControls, EvidenceUpload, RecordDisbursement, RequesterActions, ReviewPanel } from "@/components/finance/expense-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const when = (v: unknown) => {
  if (!v) return "Not recorded";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" }).format(d);
};
const actionLabels: Record<string, string> = {
  created: "Draft created", updated: "Request edited", submit: "Submitted for review", withdraw: "Withdrawn to draft", cancel: "Cancelled",
  approve: "Approved", return: "Returned for correction", reject: "Rejected", disbursement_recorded: "Disbursement recorded",
  disbursement_void: "Disbursement voided", disbursement_reconcile: "Disbursement reconciled", document_attached: "Document attached",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await readExpenseDetail(id);
  const e = d.expense;
  const status = String(e.status);
  const currency = String(e.currency);
  const disbursed = String(e.disbursed);
  const reconciled = String(e.reconciled);
  const outstanding = status === "approved" ? (Number(e.total) - Number(disbursed)).toFixed(2) : "0";
  const today = (await db.execute<{ d: string }>(sql`SELECT finance_kampala_today()::text AS d`)).rows[0].d;
  const fullyReconciled = status === "paid" && Number(disbursed) > 0 && reconciled === disbursed;
  const ownSubmitted = !!d.me && e.requested_by_id === d.me && status === "submitted";
  return (
    <main className="flex flex-col gap-4 p-4 md:p-6">
      <Link href="/admin/expenses" className="text-sm underline-offset-4 hover:underline">Back to expenses</Link>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardTitle className="break-words">{String(e.description)}</CardTitle>
            <CardDescription>{expenseStatusHelp[status]}</CardDescription>
          </div>
          <ExpenseStatusBadge status={status} reconciled={fullyReconciled} />
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AmountBreakdown currency={currency} status={status} total={String(e.total)} disbursed={disbursed} reconciled={reconciled} />
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-muted-foreground">Division</dt><dd className="capitalize">{String(e.division)}</dd></div>
            <div><dt className="text-muted-foreground">Project</dt><dd>{e.project_id ? <Link className="underline underline-offset-4" href={`/admin/projects/${e.project_id}`}>{String(e.project_code)} {String(e.project)}</Link> : "No project"}</dd></div>
            <div><dt className="text-muted-foreground">Category</dt><dd>{String(e.category)}</dd></div>
            <div><dt className="text-muted-foreground">Supplier</dt><dd>{String(e.supplier ?? "Not specified")}{e.supplier_invoice_reference ? ` (ref ${String(e.supplier_invoice_reference)})` : ""}</dd></div>
            <div><dt className="text-muted-foreground">Expense date</dt><dd>{String(e.incurred_on)}</dd></div>
            <div><dt className="text-muted-foreground">Amount</dt><dd>{formatAmount(currency, String(e.net_amount))} + tax {formatAmount(currency, String(e.tax_amount))}</dd></div>
            <div><dt className="text-muted-foreground">Requested by</dt><dd>{String(e.requester ?? "Not recorded (older expense)")}</dd></div>
            <div><dt className="text-muted-foreground">Submitted</dt><dd>{e.submitted_at ? when(e.submitted_at) : "Not submitted"}</dd></div>
            <div><dt className="text-muted-foreground">Approved by</dt><dd>{e.approver ? `${String(e.approver)}, ${when(e.approved_at)}` : "Not approved"}</dd></div>
            <div className="sm:col-span-2 lg:col-span-3"><dt className="text-muted-foreground">Business purpose</dt><dd className="whitespace-pre-wrap break-words">{String(e.purpose ?? "Not recorded")}</dd></div>
            {Boolean(e.review_note) && <div className="sm:col-span-2 lg:col-span-3"><dt className="text-muted-foreground">Latest review note{e.reviewer ? ` from ${String(e.reviewer)}` : ""}</dt><dd className="whitespace-pre-wrap break-words">{String(e.review_note)}</dd></div>}
          </dl>
        </CardContent>
      </Card>

      {(d.can.edit || d.can.submit || d.can.withdraw || d.can.cancel || d.can.review || d.can.disburse || ownSubmitted) && (
        <Card>
          <CardHeader><CardTitle>Next step</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {d.can.edit && <div><Button variant="outline" render={<Link href={`/admin/expenses/${id}/edit`} />}>Edit request</Button></div>}
            <RequesterActions expenseId={id} version={Number(e.version)} requestKey={randomUUID()} canSubmit={d.can.submit} canWithdraw={d.can.withdraw} canCancel={d.can.cancel} />
            {ownSubmitted && <p className="text-sm text-muted-foreground">You requested this expense, so another authorized employee must review it.</p>}
            {d.can.review && <ReviewPanel expenseId={id} version={Number(e.version)} requestKey={randomUUID()} canApprove={d.can.approve} canReturnOrReject={d.can.returnOrReject} />}
            {d.can.disburse && <RecordDisbursement expenseId={id} version={Number(e.version)} currency={currency} outstanding={outstanding} requestKey={randomUUID()} staff={d.staff} documents={d.documents.map((x) => ({ id: String(x.id), name: String(x.name) }))} accounts={d.accounts} defaultResponsible={d.me ?? ""} today={today} />}
          </CardContent>
        </Card>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Documents</CardTitle><CardDescription>Receipts, supplier invoices and proof of payment. Stored privately.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {d.documents.length ? (
              <ul className="divide-y text-sm">
                {d.documents.map((doc) => <li key={String(doc.id)} className="flex flex-wrap items-center justify-between gap-2 py-2"><a className="underline underline-offset-4 break-all" href={`/api/finance/documents/${doc.id}`} target="_blank" rel="noopener">{String(doc.name)}</a><span className="text-xs text-muted-foreground">{Math.ceil(Number(doc.size_bytes) / 1024)} KB, {when(doc.created_at)}</span></li>)}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No documents attached yet.</p>}
            {d.can.uploadAsRequester && <EvidenceUpload expenseId={id} role="requester" label="Attach a receipt or supplier invoice" />}
            {d.can.uploadAsFinance && <EvidenceUpload expenseId={id} role="finance" label="Attach proof of payment" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Disbursements</CardTitle><CardDescription>Payments recorded manually by finance. Not externally verified until reconciled against a statement.</CardDescription></CardHeader>
          <CardContent>
            {d.disbursements.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Paid</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Method / reference</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {d.disbursements.map((x) => {
                      const live = x.status === "recorded" && !x.reconciled_at;
                      return (
                        <TableRow key={String(x.id)}>
                          <TableCell className="align-top">{String(x.paid_on)}<div className="text-xs text-muted-foreground">By {String(x.responsible ?? "Unknown")}; recorded by {String(x.recorded_by ?? "Unknown")}</div></TableCell>
                          <TableCell className="text-right align-top tabular-nums">{formatAmount(String(x.currency), String(x.amount))}</TableCell>
                          <TableCell className="align-top">{disbursementMethodLabels[String(x.method)] ?? String(x.method)}<div className="text-xs break-all text-muted-foreground">{String(x.reference ?? "No reference")}{x.source_account ? ` from ${String(x.source_account)}` : ""}</div></TableCell>
                          <TableCell className="align-top">
                            {x.status === "void" ? <><Badge variant="destructive">Void</Badge><div className="text-xs text-muted-foreground">{String(x.void_reason ?? "")}</div></> : x.reconciled_at ? <><Badge variant="outline">Reconciled</Badge><div className="text-xs text-muted-foreground">{String(x.reconciliation_reference ?? "")} by {String(x.reconciled_by ?? "")}</div></> : <Badge variant="secondary">Recorded, not reconciled</Badge>}
                            {live && <div className="mt-2"><DisbursementControls disbursementId={String(x.id)} voidKey={randomUUID()} reconcileKey={randomUUID()} canVoid={d.can.voidDisbursement} canReconcile={d.can.reconcile && x.recorded_by_id !== d.me} /></div>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : <p className="text-sm text-muted-foreground">{status === "approved" ? "Approved and awaiting payment. No disbursement recorded yet." : status === "paid" ? "Marked paid before disbursement records were kept." : "No disbursements. Payments can only be recorded after approval."}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>History</CardTitle><CardDescription>Permanent record of every change to this request (most recent 100).</CardDescription></CardHeader>
        <CardContent>
          {d.history.length ? (
            <ol className="flex flex-col gap-3 text-sm">
              {d.history.map((h) => (
                <li key={String(h.id)} className="border-l-2 pl-3">
                  <p className="font-medium">{actionLabels[String(h.action)] ?? String(h.action)}{h.to_status && h.from_status !== h.to_status ? ` (${expenseStatusLabels[String(h.from_status)] ?? "New"} to ${expenseStatusLabels[String(h.to_status)] ?? String(h.to_status)})` : ""}</p>
                  <p className="text-muted-foreground">{String(h.actor)}, {when(h.created_at)}</p>
                  {Boolean(h.note) && <p className="whitespace-pre-wrap break-words">{String(h.note)}</p>}
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-muted-foreground">No workflow history recorded. This expense was created before the Phase 1D workflow.</p>}
        </CardContent>
      </Card>
    </main>
  );
}
