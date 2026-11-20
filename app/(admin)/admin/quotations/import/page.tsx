import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { staffContext } from "@/lib/sales/permissions";
import { salesConfig } from "@/lib/sales/config";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { QuotationImport } from "@/components/sales/quotation-import";

export const metadata = { title: "Import quotations" };

export default async function Page() {
  const ctx = await staffContext("quotations_create");
  const allowed = ctx.permissions.includes("clients_write") && ctx.permissions.includes("projects_write");
  return (
    <PageContainer width="reading">
      <PageHeader
        title="Import quotations"
        description="Bring existing quotations in from a spreadsheet. Each one becomes a draft with its client and planned project, ready to review and send."
        secondaryActions={
          <Button variant="ghost" nativeButton={false} render={<Link href="/admin/quotations" />}>
            <ArrowLeftIcon /> Quotations
          </Button>
        }
      />
      {allowed ? (
        <QuotationImport taxRate={salesConfig().taxRate} />
      ) : (
        <div className="surface-card overflow-hidden">
          <EmptyState kind="restricted" description="Importing creates clients and projects as well as quotations. Ask an administrator for client and project permissions." />
        </div>
      )}
    </PageContainer>
  );
}
