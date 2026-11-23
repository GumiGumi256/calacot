import Link from "next/link";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { expenseFormOptions, readExpenseDetail } from "@/lib/finance/expenses";
import { ExpenseForm } from "@/components/finance/expense-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await readExpenseDetail(id);
  const e = detail.expense;
  if (!detail.can.edit) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <h1 className="text-xl font-semibold">This request cannot be edited</h1>
        <p>Only the requester can edit a draft or a request returned for correction.</p>
        <Link href={`/admin/expenses/${id}`} className="underline underline-offset-4">Back to the request</Link>
      </div>
    );
  }
  const [options, today] = await Promise.all([
    expenseFormOptions(),
    db.execute<{ d: string }>(sql`SELECT finance_kampala_today()::text AS d`).then((r) => r.rows[0].d),
  ]);
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Link href={`/admin/expenses/${id}`} className="text-sm underline-offset-4 hover:underline">Back to the request</Link>
      <Card>
        <CardHeader>
          <CardTitle>Edit expense request</CardTitle>
          <CardDescription>
            {e.status === "returned" ? `Returned for correction: ${String(e.review_note ?? "")}` : "Draft changes are saved as a new version. Submit when ready."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExpenseForm
            requestKey={randomUUID()}
            projects={options.projects}
            suppliers={options.suppliers} members={options.members} divisionOptions={options.divisionOptions} defaultCurrency={options.defaultCurrency}
            today={today}
            initial={{
              id, version: Number(e.version), division: String(e.division), projectId: String(e.project_id ?? ""), category: String(e.category),
              supplierId: String(e.supplier_id ?? ""), description: String(e.description), purpose: String(e.purpose ?? ""), currency: String(e.currency),
              netAmount: String(e.net_amount), taxAmount: Number(e.tax_amount) ? String(e.tax_amount) : "", incurredOn: String(e.incurred_on),
              supplierInvoiceReference: String(e.supplier_invoice_reference ?? ""),
              payees: detail.payees.map((l) => ({ memberId: l.member_id, amount: l.amount })),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
