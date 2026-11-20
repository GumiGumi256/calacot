import Link from "next/link";
import { redirect } from "next/navigation";
import { DownloadIcon, PlusIcon } from "lucide-react";
import { parseQuery } from "@/lib/sales/contracts";
import { readList } from "@/lib/sales/reads";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { PageContainer } from "@/components/layout/page-container";
import { QuotationsTable, type QuotationRow } from "@/components/sales/quotations-table";

/*
 * Quotations list: first module on the Design System V1 table (docs Phase 3).
 * Data, permissions and URL parameters are unchanged: readList("quotations") still enforces
 * quotations_read and organization scoping, and parseQuery accepts the same parameters.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = parseQuery(raw);
  const data = await readList("quotations", query);
  if (data.query.page !== query.page) {
    const p = new URLSearchParams(Object.entries(raw).filter((v): v is [string, string] => typeof v[1] === "string"));
    p.set("page", String(data.query.page));
    redirect(`/admin/quotations?${p}`);
  }
  const canCreate = data.permissions.includes("quotations_create");
  const exportHref = `/api/sales/quotations/export?${new URLSearchParams(Object.entries(data.query).map(([k, v]) => [k, String(v)]))}`;
  return (
    <PageContainer>
      <PageHeader
        title="Quotations"
        description="Prepare, send and track quotations through to confirmation."
        secondaryActions={
          <Button variant="outline" nativeButton={false} render={<a href={exportHref} />} title="Downloads up to 1,000 matching quotations as CSV">
            <DownloadIcon /> Export CSV
          </Button>
        }
        primaryAction={
          canCreate && (
            <Button nativeButton={false} render={<Link href="/admin/quotations/new" />}>
              <PlusIcon /> New quotation
            </Button>
          )
        }
      />
      <QuotationsTable
        rows={data.rows as QuotationRow[]}
        total={data.total}
        query={data.query}
        canCreate={canCreate}
        summary={data.summary.map(({ currency, total }) => ({ currency, total }))}
      />
    </PageContainer>
  );
}
