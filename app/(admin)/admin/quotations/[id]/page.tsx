import Link from "next/link";
import { documentDetail, pickers } from "@/lib/sales/reads";
import { quoteSchema } from "@/lib/sales/contracts";
import { salesConfig } from "@/lib/sales/config";
import { QuoteForm } from "@/components/sales/quote-form";
import { TransitionControls } from "@/components/sales/transition-controls";
import { Activity, Deliveries } from "@/components/sales/activity";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = await documentDetail("quotations", id),
    q = d.record,
    v = d.current;
  const status =
    v.status === "sent" &&
    v.valid_until &&
    new Date(String(v.valid_until)) <= new Date()
      ? "expired"
      : String(v.status);
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
          })),
          schedules: d.schedules.map((s) => ({
            label: s.label,
            amount: s.amount,
            dueAt: s.due_at ? new Date(String(s.due_at)).toISOString() : "",
          })),
        })
      : undefined;
  const data = initial ? await pickers(String(q.client_id)) : undefined;
  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {String(q.number || "Draft")} · {String(q.title)}
          </CardTitle>
          <CardDescription>
            Revision {String(v.version)} ·{" "}
            <Badge variant="secondary">
              {status === "accepted" ? "Confirmed" : status}
            </Badge>{" "}
            · {String(v.currency)} {String(v.total)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p>{String(v.scope)}</p>
          <Link
            href={`/api/sales/quotations/${id}/pdf?versionId=${v.id}`}
            target="_blank"
          >
            {status === "draft"
              ? "Watermarked draft preview"
              : "Download final PDF"}
          </Link>
          {q.project_id ? (
            <Link href={`/admin/projects/${q.project_id}`}>Linked project</Link>
          ) : (
            <p>
              Historical record requires verified project reconciliation before
              sending.
            </p>
          )}
          <TransitionControls
            entity="quotations"
            id={id}
            versionId={String(v.id)}
            revision={Number(v.revision)}
            status={status}
            permissions={d.permissions}
            summary={`${q.title} · ${d.context.client} · ${d.context.project} · revision ${v.version} · ${v.currency} ${v.total} · ${v.document_snapshot ? (v.document_snapshot as Record<string, unknown>).billingPolicy : salesConfig().policy} billing · Email: ${v.document_snapshot ? ((v.document_snapshot as Record<string, unknown>).customer as Record<string, unknown>).email : d.context.recipient}`}
          />
          {initial && data && d.permissions.includes("quotations_edit") && (
            <QuoteForm
              initial={initial}
              pickers={data}
              taxRate={salesConfig().taxRate}
            />
          )}
          <ul>
            {d.versions.map((version) => (
              <li key={String(version.id)}>
                Revision {String(version.version)} ·{" "}
                {String(version.status) === "accepted"
                  ? "Confirmed"
                  : String(version.status)}{" "}
                · {String(version.currency)} {String(version.total)}
                {version.status !== "draft" && (
                  <>
                    {" "}
                    ·{" "}
                    <Link
                      href={`/api/sales/quotations/${id}/pdf?versionId=${version.id}`}
                    >
                      PDF
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Deliveries rows={d.deliveries} permissions={d.permissions} />
      <Activity events={d.activity} />
    </main>
  );
}
