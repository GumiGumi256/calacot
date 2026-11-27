import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { catalogueItemTypes, catalogueTypeLabels } from "@/lib/catalogue/contracts";
import { divisions, currencies } from "@/lib/sales/contracts";
import { label } from "@/lib/admin/options";
import { FilterSheet } from "@/components/filters/filter-sheet";

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
 * Desktop: search and every filter in one aligned row. Phones: search first, the other filters in a
 * bottom sheet (same pattern as Documents). Painting/Active are the defaults and do not count
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

    <div className="flex flex-col gap-3 md:hidden">
      <form method="get" role="search" className="flex gap-2" aria-label="Search catalogue items">
        {Object.entries({ division: values.division, type: values.type, category: values.category, currency: values.currency, status: values.status }).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <SearchInput value={values.q} id="cat-m-q" /><Button type="submit" variant="secondary">Search</Button>
      </form>
      <FilterSheet title="Filter items" activeCount={active} resetHref="?" hidden={{ q: values.q }} className="self-start">
        <Selects values={values} categories={categories} id="cat-m" field="flex min-w-0 flex-col gap-1.5 text-sm font-medium" />
      </FilterSheet>
    </div>
  </>;
}
