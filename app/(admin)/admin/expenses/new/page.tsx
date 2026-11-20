import Link from "next/link";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { expenseFormOptions } from "@/lib/finance/expenses";
import { ExpenseForm } from "@/components/finance/expense-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { PageContainer } from "@/components/layout/page-container";

export default async function Page() {
  const options = await expenseFormOptions();
  const today = (await db.execute<{ d: string }>(sql`SELECT finance_kampala_today()::text AS d`)).rows[0].d;
  return (
    <PageContainer width="reading">
      <Link href="/admin/expenses" className="text-sm underline-offset-4 hover:underline">Back to expenses</Link>
      <PageHeader
        title="New expense request"
        description="Save a draft first, attach receipts, then submit it for review. Someone other than you must approve it."
      />
      <Card>
        <CardContent>
          <ExpenseForm requestKey={randomUUID()} projects={options.projects} suppliers={options.suppliers} divisionOptions={options.divisionOptions} defaultCurrency={options.defaultCurrency} today={today} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
