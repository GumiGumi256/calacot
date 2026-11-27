import Link from "next/link";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { FilterSheet } from "@/components/filters/filter-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { kindLabels, recordLabels } from "@/lib/documents/labels";

export function DocumentsFilters({ values, kinds }: { values: Record<string, string>; kinds: readonly string[] }) {
  const active = [values.kind, values.record, values.status !== "active" ? values.status : "", values.from, values.to].filter(Boolean).length;
  const reset = values.projectId ? `?projectId=${encodeURIComponent(values.projectId)}` : "?";
  const records = ["client", "project", "task", "milestone", "staff", "company", "expense", "invoice", "quotation"];
  const fieldsFor = (block: boolean) => <>
        <label className={block ? "flex min-w-0 flex-col gap-1.5 text-sm font-medium" : "min-w-0 space-y-1 text-sm"}><span>Category</span><NativeSelect name="kind" defaultValue={values.kind} wrapperClassName="w-full"><option value="">All</option>{kinds.map(k => <option key={k} value={k}>{kindLabels[k] ?? k}</option>)}</NativeSelect></label>
        <label className={block ? "flex min-w-0 flex-col gap-1.5 text-sm font-medium" : "min-w-0 space-y-1 text-sm"}><span>Linked to</span><NativeSelect name="record" defaultValue={values.record} wrapperClassName="w-full"><option value="">All</option>{records.map(r => <option key={r} value={r}>{recordLabels[r] ?? r}</option>)}</NativeSelect></label>
        <label className={block ? "flex min-w-0 flex-col gap-1.5 text-sm font-medium" : "min-w-0 space-y-1 text-sm"}><span>Status</span><NativeSelect name="status" defaultValue={values.status} wrapperClassName="w-full"><option value="active">Active</option><option value="archived">Archived</option></NativeSelect></label>
        <label className={block ? "flex min-w-0 flex-col gap-1.5 text-sm font-medium" : "min-w-0 space-y-1 text-sm"}><span>From</span><Input name="from" type="date" defaultValue={values.from} /></label>
        <label className={block ? "flex min-w-0 flex-col gap-1.5 text-sm font-medium" : "min-w-0 space-y-1 text-sm"}><span>Through</span><Input name="to" type="date" defaultValue={values.to} /></label>
  </>;
  return <>
  <form method="get" className="space-y-3">
    {values.projectId && <input type="hidden" name="projectId" value={values.projectId} />}
    <div className="flex gap-2"><div className="relative min-w-0 flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input name="search" type="search" aria-label="Search documents" placeholder="Search documents" defaultValue={values.search} className="pl-9" /></div><Button type="submit" variant="secondary">Search</Button></div>
    {/* Phones hide this fold-out (its fields still submit, keeping applied filters when searching) and use the bottom sheet below. */}
    <details open={active > 0} className="group max-md:hidden"><summary className="flex min-h-11 w-full cursor-pointer list-none items-center gap-2 rounded-(--control-radius) border border-input px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-fit sm:min-w-36"><SlidersHorizontal className="size-4" aria-hidden="true" />Filters{active > 0 && <span className="rounded-full bg-secondary px-2 text-xs tabular-nums">{active}</span>}<ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary>
      <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-5">
        {fieldsFor(false)}
      </div>
      <div className="flex gap-2 pt-4"><Button type="submit" variant="secondary" className="flex-1 sm:flex-none">Apply filters</Button><Button variant="outline" className="flex-1 sm:flex-none" render={<Link href={reset} />}>Reset</Button></div>
    </details>
  </form>
  <FilterSheet title="Filter documents" activeCount={active} resetHref={reset} hidden={{ search: values.search, projectId: values.projectId }} className="mt-3 md:hidden">
    {fieldsFor(true)}
  </FilterSheet>
  </>;
}
