import { formatAmount } from "@/lib/utils";

export function PurchaseStatus({
  purchase,
}: {
  purchase: {
    designTitle: string;
    packageName: string;
    amount: number | string;
    currency: string;
  };
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <h2 className="text-base font-medium">Purchase Summary</h2>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Design:</span>
          <span className="font-medium">{purchase.designTitle}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Package:</span>
          <span className="font-medium">{purchase.packageName}</span>
        </div>
        <div className="flex justify-between pt-3 border-t border-border">
          <span className="font-medium">Amount:</span>
          <span className="font-semibold">
            {formatAmount(purchase.amount, purchase.currency)}
          </span>
        </div>
      </div>
    </div>
  );
}
