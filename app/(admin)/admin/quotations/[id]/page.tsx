import Link from "next/link";
import { documentDetail, pickers } from "@/lib/sales/reads";
import { quoteSchema } from "@/lib/sales/contracts";
import { salesConfig } from "@/lib/sales/config";
import { QuoteForm } from "@/components/sales/quote-form";
import { TransitionControls } from "@/components/sales/transition-controls";
import { Activity, Deliveries } from "@/components/sales/activity";
import { FileDownIcon, FolderIcon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { effectiveQuotationStatus } from "@/lib/sales/quotation-status";
import { formatDate, formatMoney } from "@/lib/format";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = await documentDetail("quotations", id),
    q = d.record,
    v = d.current;
  const status = effectiveQuotationStatus(String(v.status), v.valid_until);
  const initial =
    status === "draft" && q.project_id && v.delivery_contact_id
      ? quoteSchema.parse({
          id,
          revision: v.revision,
          clientId: q.client_id,
          projectId: q.project_id,
          contactId: v.delivery_contact_id,
          title: q.title,
          division: q.division,
          currency: v.currency,
          scope: v.scope,
          deliverables: v.deliverables,
          exclusions: v.exclusions,
          terms: v.terms,
          validUntil: new Date(String(v.valid_until)).toISOString(),
          items: d.items.map((i) => ({
            description: i.description,
            unit: i.unit,
            quantity: i.quantity,
            unitPrice: i.unit_price,
            discountAmount: i.discount_amount,
            taxRate: i.tax_rate,
            catalogueItemId: i.service_id ? String(i.service_id) : "",
            name: i.item_name ? String(i.item_name) : "",
            itemType: i.item_type ? String(i.item_type) : "",
          })),
          schedules: d.schedules.map((s) => ({
            label: s.label,
            amount: s.amount,
            dueAt: s.due_at ? new Date(String(s.due_at)).toISOString() : "",
          })),
        })
      : undefined;
  const data = initial ? await pickers(String(q.client_id)) : undefined;
  const currency = String(v.currency);
  const pdfHref = `/api/sales/quotations/${id}/pdf?versionId=${v.id}`;
  const nextStep: Record<string, string> = {
    draft: "Finish the draft, then send it. Sending finalises this exact revision.",
    sent: "Waiting for the client. Record acceptance once you have verified evidence, or mark it declined.",
    expired: "The validity date has passed. Create a revision with a new date, or leave it expired.",
    declined: "The client declined. Create a revision if they asked for changes.",
    accepted: "Confirmed. The initial invoice was issued; follow payment on the invoice.",
    superseded: "A newer revision replaced this one.",
  };
  return (
    <PageContainer>
      <PageHeader
        title={String(q.title)}
        meta={
          <>
            <span className="type-body-strong tabular-nums">{String(q.number || "Draft")}</span>
            <span className="type-caption">Revision {String(v.version)}</span>
            <StatusBadge domain="quotation" status={status} />
          </>
        }
        secondaryActions={
          <Button variant="outline" nativeButton={false} render={<a href={pdfHref} target="_blank" rel="noopener" />}>
            <FileDownIcon /> {status === "draft" ? "Preview draft PDF" : "Download PDF"}
          </Button>
        }
        primaryAction={
          <TransitionControls
            entity="quotations"
            id={id}
            versionId={String(v.id)}
            revision={Number(v.revision)}
            status={status}
            permissions={d.permissions}
            summary={`${q.title} · ${d.context.client} · ${d.context.project} · revision ${v.version} · ${formatMoney(currency, String(v.total))} · ${v.document_snapshot ? (v.document_snapshot as Record<string, unknown>).billingPolicy : salesConfig().policy} billing · Email: ${v.document_snapshot ? ((v.document_snapshot as Record<string, unknown>).customer as Record<string, unknown>).email : d.context.recipient}`}
          />
        }
      />

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Scope</CardTitle>
              {nextStep[status] && <CardDescription>{nextStep[status]}</CardDescription>}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="type-body whitespace-pre-wrap [overflow-wrap:anywhere]">{String(v.scope)}</p>
              {!q.project_id && (
                <p role="note" className="rounded-(--card-radius-inner) border border-warning-border bg-warning-soft p-3 type-body text-warning">
                  This historical record needs a verified project before it can be sent.
                </p>
              )}
            </CardContent>
          </Card>
          {initial && data && d.permissions.includes("quotations_edit") && (
            <Card>
              <CardHeader>
                <CardTitle as="h2">Edit draft</CardTitle>
                <CardDescription>Changes are saved as this draft revision. Nothing is sent until you choose Send quotation.</CardDescription>
              </CardHeader>
              <CardContent>
                <QuoteForm
                  initial={initial}
                  pickers={data}
                  taxRate={salesConfig().taxRate}
                  lineRefs={d.items.map((i) => (i.catalogue_unit_price ? String(i.catalogue_unit_price) : ""))}
                  can={{ pick: d.permissions.includes("catalogue_read"), override: d.permissions.includes("quotation_price_override"), manage: d.permissions.includes("catalogue_manage") }}
                />
              </CardContent>
            </Card>
          )}
          <Deliveries rows={d.deliveries} permissions={d.permissions} />
          <Activity events={d.activity} />
        </div>

        <aside className="flex min-w-0 flex-col gap-6" aria-label="Quotation summary">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3">
                <div>
                  <dt className="type-caption">Total</dt>
                  <dd className="type-metric-sm">{formatMoney(currency, String(v.total))}</dd>
                </div>
                <div>
                  <dt className="type-caption">Client</dt>
                  <dd className="type-body">
                    <Link className="underline-offset-4 hover:underline" href={`/admin/clients/${q.client_id}`}>{d.context.client}</Link>
                  </dd>
                </div>
                <div>
                  <dt className="type-caption">Project</dt>
                  <dd className="type-body">
                    {q.project_id ? (
                      <Link className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline" href={`/admin/projects/${q.project_id}`}>
                        <FolderIcon aria-hidden className="size-3.5" />
                        {d.context.project}
                      </Link>
                    ) : (
                      "Not linked"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="type-caption">Valid until</dt>
                  <dd className={status === "expired" ? "type-body text-destructive-text" : "type-body"}>{formatDate(v.valid_until as string)}</dd>
                </div>
                <div>
                  <dt className="type-caption">Sends to</dt>
                  <dd className="type-body [overflow-wrap:anywhere]">{d.context.recipient || "No delivery contact"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle as="h2">Revisions</CardTitle>
              <CardDescription>Every sent revision is kept unchanged.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col">
                {d.versions.map((version) => {
                  const versionStatus = effectiveQuotationStatus(String(version.status), version.valid_until);
                  const current = String(version.id) === String(v.id);
                  return (
                    <li key={String(version.id)} className="relative flex gap-3 pb-4 last:pb-0">
                      <span aria-hidden className={current ? "mt-1.5 size-2.5 shrink-0 rounded-full bg-primary" : "mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-muted-foreground/40"} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="type-body-strong">Revision {String(version.version)}</span>
                          {current && <span className="type-caption">(current)</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge domain="quotation" status={versionStatus} />
                          <span className="type-caption tabular-nums">{formatMoney(String(version.currency), String(version.total))}</span>
                        </div>
                        {version.status !== "draft" && (
                          <a className="type-caption underline-offset-4 hover:underline" href={`/api/sales/quotations/${id}/pdf?versionId=${version.id}`}>
                            Download PDF
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}
