import Link from "next/link";
import { documentDetail } from "@/lib/sales/reads";
import { TransitionControls } from "@/components/sales/transition-controls";
import { PaymentForm } from "@/components/sales/payment-form";
import { Activity, Deliveries } from "@/components/sales/activity";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { PageContainer } from "@/components/layout/page-container";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/format";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = await documentDetail("invoices", id),
    i = d.record;
  return (
    <PageContainer>
      <PageHeader
        title={String(i.number)}
        description={<>{formatMoney(String(i.currency), String(i.total))} · Amount due {formatMoney(String(i.currency), String(i.balance))}</>}
        meta={<StatusBadge domain="invoice" status={String(i.status)} />}
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p>
            {String(i.notes || "")} · Due {String(i.due_on || "—")}
          </p>
          <Link href={`/api/sales/invoices/${id}/pdf`} target="_blank">
            Download immutable invoice PDF
          </Link>
          {!!i.project_id && (
            <Link href={`/admin/projects/${i.project_id}`}>Project</Link>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.items.map((item) => (
                  <TableRow key={String(item.id)}>
                    <TableCell>{String(item.description)}</TableCell>
                    <TableCell>{String(item.quantity)}</TableCell>
                    <TableCell>{String(item.unit_price)}</TableCell>
                    <TableCell>{String(item.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <TransitionControls
            entity="invoices"
            id={id}
            status={String(i.status)}
            summary={`${i.number} · ${i.currency} ${i.total}`}
            permissions={d.permissions}
          />
        </CardContent>
      </Card>
      {i.status === "issued" && d.permissions.includes("payments_verify") && (
        <Card>
          <CardHeader>
            <CardTitle>Record and verify payment</CardTitle>
            <CardDescription>
              Submitted references remain pending until separately verified.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentForm invoiceId={id} payments={d.payments} />
          </CardContent>
        </Card>
      )}
      <Deliveries rows={d.deliveries} permissions={d.permissions} />
      <Activity events={d.activity} />
    </PageContainer>
  );
}
