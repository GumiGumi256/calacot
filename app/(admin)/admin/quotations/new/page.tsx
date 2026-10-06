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
  await staffContext("quotations_create");
  const data = await pickers();
  return (
    <main className="p-4 md:p-6">
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>New quotation</CardTitle>
          <CardDescription>
            A client and planned project must exist before you save.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuoteForm pickers={data} taxRate={salesConfig().taxRate} />
        </CardContent>
      </Card>
    </main>
  );
}
