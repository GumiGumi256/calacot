import Link from "next/link";
import { readPayments, type SearchParams } from "@/lib/admin/reads";
import { receivablesOverview } from "@/lib/finance/receivables";
import { label, paymentMethods, paymentStatuses } from "@/lib/admin/options";
import { ReceivablesPanel } from "@/components/finance/receivables-panel";
import {
  FilterBar,
  Pager,
  Totals,
  fmtDate,
  fmtMoney,
} from "@/components/admin/list-controls";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const statusLabels: Record<string, string> = { submitted: "Awaiting verification", confirmed: "Confirmed", rejected: "Rejected" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [data, overview] = await Promise.all([readPayments(await searchParams), receivablesOverview("payments_read")]);
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <ReceivablesPanel data={overview} focus="payments" />
      <Card>
        <CardHeader>
          <CardTitle as="h1">Payments</CardTitle>
          <CardDescription>
            Received customer payments and how much of each has been allocated to invoices.
            Verify and allocate payments from the invoice page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FilterBar
            reset="?"
            values={data.filters}
            fields={[
              { name: "search", label: "Search", type: "search" },
              { name: "status", label: "Status", type: "select", options: paymentStatuses },
              { name: "method", label: "Method", type: "select", options: paymentMethods },
              { name: "currency", label: "Currency", type: "select", options: ["UGX", "USD"] },
              { name: "from", label: "From date", type: "date" },
              { name: "to", label: "Through date", type: "date" },
            ]}
          />
          <Totals rows={data.summary} />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Unallocated</TableHead>
                  <TableHead>Invoices</TableHead>
                  <TableHead>Method / reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      No payments match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {data.rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.receipt_number ?? "Pending"}</TableCell>
                    <TableCell className="font-medium">
                      {data.canSeeClients ? <Link className="underline-offset-4 hover:underline" href={`/admin/clients/${p.client_id}`}>{p.client}</Link> : p.client}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(p.currency, p.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(p.currency, p.allocated)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.status === "confirmed" ? fmtMoney(p.currency, p.unallocated) : "-"}</TableCell>
                    <TableCell>
                      {p.invoices.length === 0 ? <span className="text-muted-foreground">None</span> : p.invoices.map((i, n) => (
                        <span key={i.id}>{n > 0 && ", "}{data.canSeeInvoices ? <Link className="underline-offset-4 hover:underline" href={`/admin/invoices/${i.id}`}>{i.number ?? "Draft"}</Link> : i.number ?? "Draft"}</span>
                      ))}
                    </TableCell>
                    <TableCell><span className="capitalize">{label(p.method)}</span><div className="text-xs text-muted-foreground break-all">{p.reference ?? "No reference"}</div></TableCell>
                    <TableCell>
                      <Badge variant={p.status === "rejected" ? "destructive" : p.status === "confirmed" ? "default" : "secondary"}>
                        {statusLabels[p.status] ?? p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{fmtDate(p.received_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager
            path=""
            params={{ ...data.filters, size: String(data.size) }}
            page={data.page}
            size={data.size}
            total={data.total}
          />
        </CardContent>
      </Card>
    </div>
  );
}
