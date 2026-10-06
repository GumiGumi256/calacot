import { readExpenses, type SearchParams } from "@/lib/admin/reads";
import { expenseStatuses } from "@/lib/admin/options";
import { divisions } from "@/lib/sales/contracts";
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
  const data = await readExpenses(await searchParams);
  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
          <CardDescription>
            Company spending by division, supplier and project.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FilterBar
            reset="?"
            values={data.filters}
            fields={[
              { name: "search", label: "Search", type: "search" },
              { name: "status", label: "Status", type: "select", options: expenseStatuses },
              { name: "division", label: "Division", type: "select", options: divisions },
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
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Division</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Incurred</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">
                      No expenses match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {data.rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      {e.description}
                      {e.supplier_invoice_reference && (
                        <div className="text-xs text-muted-foreground">
                          Ref {e.supplier_invoice_reference}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{e.category}</TableCell>
                    <TableCell className="capitalize">{e.division}</TableCell>
                    <TableCell>{e.supplier}</TableCell>
                    <TableCell>{e.project}</TableCell>
                    <TableCell>{fmtMoney(e.currency, e.total)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{fmtDate(e.incurred_at)}</TableCell>
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
