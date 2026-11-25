import Link from "next/link";
import { readCatalogue } from "@/lib/catalogue/reads";
import { catalogueTypeLabels, type CatalogueItem } from "@/lib/catalogue/contracts";
import { CatalogueItemDialog, CatalogueStatusButton } from "@/components/catalogue/catalogue-forms";
import { CatalogueFilters } from "@/components/catalogue/catalogue-filters";
import { CatalogueInfo } from "@/components/catalogue/catalogue-info";
import { Pager } from "@/components/admin/list-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { PageContainer } from "@/components/layout/page-container";

const price = (r: CatalogueItem) => `${r.currency} ${Number(r.unit_price).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const status = (r: CatalogueItem) => (r.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>);
const updated = (r: CatalogueItem) => `Updated ${r.updated_at.slice(0, 10)}${r.updated_by ? ` by ${r.updated_by}` : ""}`;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const d = await readCatalogue(await searchParams);
  const values = { q: d.filters.search, division: d.filters.division, type: d.filters.itemType, currency: d.filters.currency, category: d.filters.category, status: d.filters.status };
  const actions = (r: CatalogueItem) => d.canManage && (
    <div className="flex flex-wrap items-start gap-2">
      <CatalogueItemDialog item={r} categories={d.categories} trigger={<Button size="sm" variant="outline" />} triggerLabel="Edit" />
      <CatalogueStatusButton item={r} />
    </div>
  );
  const filtered = !!(values.q || values.type || values.category || values.currency || values.division !== "painting" || values.status !== "active");
  return (
    <PageContainer>
      <PageHeader
        title="Item catalogue"
        description={<span className="inline-flex items-center gap-2">Default items and prices for quotations. <CatalogueInfo /></span>}
        primaryAction={d.canManage && <CatalogueItemDialog categories={d.categories} trigger={<Button />} triggerLabel="New item" initial={{ division: d.filters.division || "painting" }} />}
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <CatalogueFilters values={values} categories={d.categories} />
          {d.rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-(--card-radius-inner) border border-dashed px-4 py-10 text-center text-sm">
              <p className="font-medium">{filtered ? "No items match these filters" : "No items in this catalogue yet"}</p>
              <p className="max-w-sm text-muted-foreground">{filtered ? "Try another search, or reset the filters to see all active Painting items." : "Add the materials, labour and services you quote most often so they can be picked when writing a quotation."}</p>
              {filtered && <Button variant="outline" size="sm" render={<Link href="?" />}>Reset filters</Button>}
            </div>
          ) : (
            <>
              {/* Phones: one card per item. */}
              <ul className="flex flex-col gap-3 md:hidden" aria-label="Catalogue items">
                {d.rows.map((r) => (
                  <li key={r.id} className="flex flex-col gap-3 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium break-words">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.code} · <span className="capitalize">{r.division}</span></p>
                      </div>
                      {status(r)}
                    </div>
                    {r.description && <p className="line-clamp-2 text-sm text-muted-foreground">{r.description}</p>}
                    <div className="flex items-end justify-between gap-3">
                      <p className="text-sm text-muted-foreground">{[r.category, catalogueTypeLabels[r.item_type] ?? r.item_type, `per ${r.unit}`].filter(Boolean).join(" · ")}</p>
                      <p className="shrink-0 font-semibold tabular-nums">{price(r)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{updated(r)}</p>
                    {actions(r)}
                  </li>
                ))}
              </ul>
              {/* Wider screens: the full table. */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Category</TableHead><TableHead>Type</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Default price</TableHead><TableHead>Status</TableHead>{d.canManage && <TableHead><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
                  <TableBody>
                    {d.rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="max-w-72 whitespace-normal"><div className="font-medium break-words">{r.name}</div><div className="text-xs text-muted-foreground">{r.code} · {r.division}</div>{r.description && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description}</div>}</TableCell>
                        <TableCell>{r.category || "—"}</TableCell>
                        <TableCell>{catalogueTypeLabels[r.item_type] ?? r.item_type}</TableCell>
                        <TableCell>{r.unit}</TableCell>
                        <TableCell className="text-right tabular-nums">{price(r)}</TableCell>
                        <TableCell>{status(r)}<div className="mt-1 text-xs text-muted-foreground">{updated(r)}</div></TableCell>
                        {d.canManage && <TableCell>{actions(r)}</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
          {d.total > d.size && <Pager path="" params={{ ...values }} page={d.page} size={d.size} total={d.total} />}
          {d.total > 0 && d.total <= d.size && <p className="text-sm text-muted-foreground">{d.total} item{d.total === 1 ? "" : "s"}</p>}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
