import { staffContext } from "@/lib/sales/permissions";
import { pickers } from "@/lib/sales/reads";
import { salesConfig } from "@/lib/sales/config";
import { QuoteForm } from "@/components/sales/quote-form";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
export default async function Page() {
  const ctx = await staffContext("quotations_create");
  const data = await pickers();
  return (
    <div className="p-4 md:p-6">
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle as="h1">New quotation</CardTitle>
          <CardDescription>
            A client and planned project must exist before you save.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuoteForm pickers={data} taxRate={salesConfig().taxRate} can={{ pick: ctx.permissions.includes("catalogue_read"), override: ctx.permissions.includes("quotation_price_override"), manage: ctx.permissions.includes("catalogue_manage") }} />
        </CardContent>
      </Card>
    </div>
  );
}
