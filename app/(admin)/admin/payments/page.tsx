import { readPayments, type SearchParams } from "@/lib/admin/reads";
import { receivablesOverview } from "@/lib/finance/receivables";
import { ReceivablesPanel } from "@/components/finance/receivables-panel";
import { PaymentsTable } from "@/components/finance/payments-table";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

/*
 * Payments (Design System V1, Phase 5). Same reads and permissions as before
 * (readPayments: payments_read; receivablesOverview: payments_read), now on the shared table.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [data, overview] = await Promise.all([readPayments(await searchParams), receivablesOverview("payments_read")]);
  return (
    <PageContainer>
      <PageHeader
        title="Payments"
        description="Customer payments received and how much of each is applied to invoices. Verify and allocate a payment from its invoice."
      />
      <ReceivablesPanel data={overview} focus="payments" />
      <PaymentsTable
        rows={data.rows}
        total={data.total}
        query={{ search: data.filters.search, page: data.page, size: data.size, sort: "", desc: true }}
        values={{
          status: data.filters.status ?? "",
          method: data.filters.method ?? "",
          currency: data.filters.currency ?? "",
          from: data.filters.from ?? "",
          to: data.filters.to ?? "",
        }}
        summary={data.summary}
        canSeeClients={data.canSeeClients}
        canSeeInvoices={data.canSeeInvoices}
      />
    </PageContainer>
  );
}
