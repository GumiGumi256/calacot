import { readPayments, type SearchParams } from "@/lib/admin/reads";
import { label, paymentMethods, paymentStatuses } from "@/lib/admin/options";
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

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const data = await readPayments(await searchParams);
  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>
            Received payments and how much of each has been allocated to invoices.
            Verify payments from the invoice page.
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
                  <TableHead>Amount</TableHead>
                  <TableHead>Allocated</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">
                      No payments match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {data.rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.receipt_number ?? "Pending"}</TableCell>
                    <TableCell className="font-medium">{p.client}</TableCell>
                    <TableCell>{fmtMoney(p.currency, p.amount)}</TableCell>
                    <TableCell>{fmtMoney(p.currency, p.allocated)}</TableCell>
                    <TableCell className="capitalize">{label(p.method)}</TableCell>
                    <TableCell>{p.reference ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {p.status}
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
    </main>
  );
}
