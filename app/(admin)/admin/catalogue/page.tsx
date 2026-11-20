import { readCatalogue } from "@/lib/catalogue/reads";
import { catalogueItemTypes, catalogueTypeLabels } from "@/lib/catalogue/contracts";
import { divisions, currencies } from "@/lib/sales/contracts";
import { CatalogueItemDialog, CatalogueStatusButton } from "@/components/catalogue/catalogue-forms";
import { FilterBar, Pager } from "@/components/admin/list-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { PageContainer } from "@/components/layout/page-container";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const d = await readCatalogue(await searchParams);
  const values = { q: d.filters.search, division: d.filters.division, type: d.filters.itemType, currency: d.filters.currency, category: d.filters.category, status: d.filters.status };
  return (
    <PageContainer>
      <PageHeader
        title="Item catalogue"
        description="Default items and selling prices for quotations, starting with the Painting division. Prices are defaults for new quotation lines; issued quotations keep the prices they were issued with."
        primaryAction={d.canManage && <CatalogueItemDialog categories={d.categories} trigger={<Button />} triggerLabel="New item" initial={{ division: d.filters.division || "painting" }} />}
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar reset="?" values={values} fields={[
            { name: "q", label: "Search", type: "search" },
            { name: "division", label: "Division", type: "select", options: divisions },
            { name: "type", label: "Type", type: "select", options: catalogueItemTypes },
            { name: "category", label: "Category", type: "select", options: d.categories },
            { name: "currency", label: "Currency", type: "select", options: currencies },
            { name: "status", label: "Status", type: "select", options: ["active", "inactive", "all"] },
          ]} />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Category</TableHead><TableHead>Type</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Default price</TableHead><TableHead>Status</TableHead>{d.canManage && <TableHead><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
              <TableBody>
                {d.rows.length === 0 && <TableRow><TableCell colSpan={d.canManage ? 7 : 6} className="py-8 text-center text-muted-foreground">No catalogue items match these filters.</TableCell></TableRow>}
                {d.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-72 whitespace-normal"><div className="font-medium break-words">{r.name}</div><div className="text-xs text-muted-foreground">{r.code} · {r.division}</div>{r.description && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description}</div>}</TableCell>
                    <TableCell>{r.category || "—"}</TableCell>
                    <TableCell>{catalogueTypeLabels[r.item_type] ?? r.item_type}</TableCell>
                    <TableCell>{r.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.currency} {r.unit_price}</TableCell>
                    <TableCell>{r.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}<div className="mt-1 text-xs text-muted-foreground">Updated {r.updated_at.slice(0, 10)}{r.updated_by ? ` by ${r.updated_by}` : ""}</div></TableCell>
                    {d.canManage && <TableCell><div className="flex flex-wrap items-start gap-2">
                      <CatalogueItemDialog item={r} categories={d.categories} trigger={<Button size="sm" variant="outline" />} triggerLabel="Edit" />
                      <CatalogueStatusButton item={r} />
                    </div></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager path="" params={{ ...values }} page={d.page} size={d.size} total={d.total} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
