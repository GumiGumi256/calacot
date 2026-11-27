import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { label } from "@/lib/admin/options";
import { NativeSelect } from "@/components/ui/native-select";
import { FilterSheet } from "@/components/filters/filter-sheet";

export type FilterField =
  | { name: string; label: string; type: "search" | "date" }
  /** `labels` maps option values to display text (e.g. "org:admin" -> "Administrator"). */
  | { name: string; label: string; type: "select"; options: readonly string[]; labels?: Record<string, string> };

export function FilterBar({
  fields,
  values,
  reset,
  hidden,
}: {
  fields: FilterField[];
  values: Record<string, string>;
  reset: string;
  hidden?: Record<string, string>;
}) {
  const searches = fields.filter((f) => f.type === "search");
  const others = fields.filter((f) => f.type !== "search");
  const activeCount = others.filter((f) => values[f.name]).length;
  const valuesOf = (list: FilterField[]) => Object.fromEntries(list.map((f) => [f.name, values[f.name]]));
  return (
    <>
      {/* Desktop and tablet: every field inline. */}
      <form method="get" className="hidden flex-wrap items-end gap-4 md:flex">
        <HiddenInputs values={hidden} />
        {fields.map((f) => (
          <Field key={f.name} field={f} value={values[f.name]} id={`f-${f.name}`} />
        ))}
        {/* Filters are a supporting control: secondary styling keeps the page's one gold primary action clear. */}
        {/* Kept together so Reset never wraps away from Apply. */}
        <div className="flex items-center gap-2">
          <Button type="submit" variant="secondary">Apply</Button>
          <Button variant="ghost" render={<Link href={reset} />}>
            Reset
          </Button>
        </div>
      </form>

      {/* Phones: search stays visible; the other filters open in a bottom sheet and apply together. */}
      <div className="flex flex-col gap-3 md:hidden">
        {searches.length > 0 && (
          <form method="get" className="flex items-end gap-2" role="search">
            <HiddenInputs values={{ ...hidden, ...valuesOf(others) }} />
            {searches.map((f) => (
              <Field key={f.name} field={f} value={values[f.name]} id={`fm-${f.name}`} className="min-w-0 flex-1" srLabel />
            ))}
            <Button type="submit" variant="secondary">Search</Button>
          </form>
        )}
        {others.length > 0 && (
          <FilterSheet activeCount={activeCount} resetHref={reset} hidden={{ ...hidden, ...valuesOf(searches) }} className="self-start">
            {others.map((f) => (
              <Field key={f.name} field={f} value={values[f.name]} id={`fs-${f.name}`} block />
            ))}
          </FilterSheet>
        )}
      </div>
    </>
  );
}

function HiddenInputs({ values }: { values?: Record<string, string | undefined> }) {
  return (
    <>
      {Object.entries(values ?? {})
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
    </>
  );
}

function Field({ field: f, value, id, className, block, srLabel }: { field: FilterField; value?: string; id: string; className?: string; block?: boolean; srLabel?: boolean }) {
  return (
    <div className={className ?? "flex flex-col gap-2"}>
      <Label htmlFor={id} className={srLabel ? "sr-only" : undefined}>{f.label}</Label>
      {f.type === "select" ? (
        <NativeSelect className="capitalize" id={id} name={f.name} defaultValue={value ?? ""} wrapperClassName={block ? "w-full" : undefined}>
          <option value="">All</option>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {f.labels?.[o] ?? label(o)}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <Input id={id} name={f.name} type={f.type} defaultValue={value ?? ""} placeholder={f.type === "search" ? "Search…" : undefined} />
      )}
    </div>
  );
}

export function Pager({
  path,
  params,
  page,
  size,
  total,
}: {
  path: string;
  params: Record<string, string>;
  page: number;
  size: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => {
    const s = new URLSearchParams(
      Object.entries({ ...params, page: String(p) }).filter(([, v]) => v),
    );
    return `${path}?${s}`;
  };
  return (
    <nav className="flex items-center justify-between gap-4 text-sm">
      <span>
        {total} record{total === 1 ? "" : "s"} · page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          render={page <= 1 ? undefined : <Link href={href(page - 1)} />}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          render={page >= pages ? undefined : <Link href={href(page + 1)} />}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

export function Totals({
  rows,
}: {
  rows: { currency: string; status: string; total: string }[];
}) {
  if (!rows.length) return null;
  return (
    <div className="flex flex-wrap gap-6 text-sm">
      {rows.map((r) => (
        <p key={`${r.currency}-${r.status}`} className="capitalize">
          {label(r.status)}: {r.currency} {Number(r.total).toLocaleString("en-US")}
        </p>
      ))}
    </div>
  );
}

export const fmtDate = (v: string | null) => (v ? v.slice(0, 10) : "—");
export const fmtMoney = (currency: string, v: string) =>
  `${currency} ${Number(v).toLocaleString("en-US")}`;
