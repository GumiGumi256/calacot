import Link from "next/link";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { catalogueItemTypes, catalogueTypeLabels } from "@/lib/catalogue/contracts";
import { divisions, currencies } from "@/lib/sales/contracts";
import { label } from "@/lib/admin/options";

export type CatalogueFilterValues = { q: string; division: string; type: string; category: string; currency: string; status: string };

/** The five filter selects. `field` styles each label wrapper so the same fields fit both layouts. */
function Selects({ values, categories, field, id }: { values: CatalogueFilterValues; categories: string[]; field: string; id: string }) {
  return <>
    <label className={field} htmlFor={`${id}-division`}><span>Division</span><NativeSelect id={`${id}-division`} name="division" defaultValue={values.division} wrapperClassName="w-full" className="capitalize"><option value="">All</option>{divisions.map((d) => <option key={d} value={d}>{label(d)}</option>)}</NativeSelect></label>
    <label className={field} htmlFor={`${id}-type`}><span>Type</span><NativeSelect id={`${id}-type`} name="type" defaultValue={values.type} wrapperClassName="w-full"><option value="">All</option>{catalogueItemTypes.map((t) => <option key={t} value={t}>{catalogueTypeLabels[t] ?? t}</option>)}</NativeSelect></label>
    <label className={field} htmlFor={`${id}-category`}><span>Category</span><NativeSelect id={`${id}-category`} name="category" defaultValue={values.category} wrapperClassName="w-full"><option value="">All</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect></label>
    <label className={field} htmlFor={`${id}-currency`}><span>Currency</span><NativeSelect id={`${id}-currency`} name="currency" defaultValue={values.currency} wrapperClassName="w-full"><option value="">All</option>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect></label>
    <label className={field} htmlFor={`${id}-status`}><span>Status</span><NativeSelect id={`${id}-status`} name="status" defaultValue={values.status} wrapperClassName="w-full"><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></NativeSelect></label>
  </>;
}

function SearchInput({ value, id }: { value: string; id: string }) {
  return <div className="relative min-w-0 flex-1">
    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    <Input id={id} name="q" type="search" aria-label="Search items" placeholder="Search items" defaultValue={value} className="pl-9" />
  </div>;
}

/**
 * Desktop: search and every filter in one aligned row. Phones: search first, the other filters folded
 * under a Filters button (same pattern as Documents). Painting/Active are the defaults and do not count
 * as active filters. Only one of the two forms is displayed, so field names never submit twice.
 */
export function CatalogueFilters({ values, categories }: { values: CatalogueFilterValues; categories: string[] }) {
  const active = [values.division !== "painting", values.type, values.category, values.currency, values.status !== "active"].filter(Boolean).length;
  return <>
    <form method="get" className="hidden flex-wrap items-end gap-3 md:flex" aria-label="Filter catalogue items">
      <div className="flex min-w-56 flex-1 flex-col gap-1 text-sm lg:max-w-xs"><label htmlFor="cat-q">Search</label><SearchInput value={values.q} id="cat-q" /></div>
      <Selects values={values} categories={categories} id="cat" field="flex w-36 flex-col gap-1 text-sm" />
      <div className="flex gap-2">
        <Button type="submit" variant="secondary">Apply</Button>
        <Button variant="ghost" render={<Link href="?" />}>Reset</Button>
      </div>
    </form>

    <form method="get" className="space-y-3 md:hidden" aria-label="Filter catalogue items">
      <div className="flex gap-2"><SearchInput value={values.q} id="cat-m-q" /><Button type="submit" variant="secondary">Search</Button></div>
      <details open={active > 0} className="group">
        <summary className="flex min-h-11 w-full cursor-pointer list-none items-center gap-2 rounded-(--control-radius) border border-input px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <SlidersHorizontal className="size-4" aria-hidden="true" />Filters
          {active > 0 && <span className="rounded-full bg-secondary px-2 text-xs tabular-nums">{active}</span>}
          <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="grid grid-cols-2 gap-4 pt-4 [&>label:last-child]:col-span-2">
          <Selects values={values} categories={categories} id="cat-m" field="min-w-0 space-y-1 text-sm" />
        </div>
        <div className="flex gap-2 pt-4">
          <Button type="submit" variant="secondary" className="flex-1">Apply filters</Button>
          <Button variant="outline" className="flex-1" render={<Link href="?" />}>Reset</Button>
        </div>
      </details>
    </form>
  </>;
}
