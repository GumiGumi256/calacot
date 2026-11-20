import { staffContext } from "@/lib/sales/permissions";
import { pickers } from "@/lib/sales/reads";
import { salesConfig } from "@/lib/sales/config";
import { QuoteForm } from "@/components/sales/quote-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

export default async function Page() {
  const ctx = await staffContext("quotations_create");
  const data = await pickers();
  return (
    <PageContainer width="reading">
      <PageHeader
        title="New quotation"
        description="Choose the client and planned project, describe the scope, then price the lines. Saving creates a draft; nothing is sent until you choose Send quotation."
      />
      <Card>
        <CardContent>
          <QuoteForm pickers={data} taxRate={salesConfig().taxRate} can={{ pick: ctx.permissions.includes("catalogue_read"), override: ctx.permissions.includes("quotation_price_override"), manage: ctx.permissions.includes("catalogue_manage") }} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
