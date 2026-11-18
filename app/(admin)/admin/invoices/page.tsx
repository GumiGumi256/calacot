import { SalesListPage } from "@/components/sales/list-page";
import { receivablesOverview } from "@/lib/finance/receivables";
import { ReceivablesPanel } from "@/components/finance/receivables-panel";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const overview = await receivablesOverview("invoices_read");
  return (
    <SalesListPage
      entity="invoices"
      searchParams={searchParams}
      before={<ReceivablesPanel data={overview} focus="invoices" />}
    />
  );
}
