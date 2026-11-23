import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ledgerAmount } from "@/lib/accounting/format";

const taxSections = [
  { href: "/admin/accounting/tax", label: "Overview" },
  { href: "/admin/accounting/tax/income", label: "Income tax" },
  { href: "/admin/accounting/tax/obligations", label: "Obligations" },
  { href: "/admin/accounting/tax/payments", label: "Payments & filings" },
  { href: "/admin/accounting/tax/settings", label: "Tax settings" },
];
const assetSections = [
  { href: "/admin/accounting/assets", label: "Asset register" },
  { href: "/admin/accounting/assets/depreciation", label: "Depreciation" },
  { href: "/admin/accounting/assets/disposals", label: "Transfers & disposals" },
];

function SubNav({ label, items, current }: { label: string; items: { href: string; label: string }[]; current: string }) {
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {items.map((s) => <Button key={s.href} size="sm" variant={current === s.href ? "secondary" : "ghost"} className="shrink-0" render={<Link href={s.href} aria-current={current === s.href ? "page" : undefined} />}>{s.label}</Button>)}
    </nav>
  );
}
export const TaxNav = ({ current }: { current: string }) => <SubNav label="Tax sections" items={taxSections} current={current} />;
export const AssetsNav = ({ current }: { current: string }) => <SubNav label="Fixed asset sections" items={assetSections} current={current} />;

/** A tax figure that may be unknown. Unknown is said in words, never shown as zero. */
export function TaxAmount({ value, currency = "UGX", unknown = "Not determined" }: { value: unknown; currency?: string; unknown?: string }) {
  if (value === null || value === undefined || value === "") return <span className="text-warning">{unknown}</span>;
  return <span className="tabular-nums"><span className="text-muted-foreground">{currency} </span>{ledgerAmount(String(value))}</span>;
}
