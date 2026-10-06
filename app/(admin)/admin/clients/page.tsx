import { SalesListPage } from "@/components/sales/list-page";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <SalesListPage entity="clients" searchParams={searchParams} />;
}
