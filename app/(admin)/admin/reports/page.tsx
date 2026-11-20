import Link from "next/link";
import { readOperationalReport, type Section } from "@/lib/reports/operational";
import { formatAmount } from "@/lib/finance/options";
import { PrintButton } from "@/components/reports/print-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const sectionLabels: Record<Section, string> = { sales: "Sales", projects: "Projects", finance: "Finance", staff: "Staff" };
const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const r = await readOperationalReport(await searchParams);
  const f = r.filters;
  const qs = (extra: Record<string, string>) => new URLSearchParams(Object.entries({ section: r.section, from: f.from, to: f.to, division: f.division, projectId: f.projectId, currency: f.currency, search: f.search, ...extra }).filter(([, v]) => v)).toString();
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle as="h1">Reports</CardTitle>
            <CardDescription>Operational reports from system records. Amounts are per currency (UGX and USD are never combined). These are management reports, not audited financial statements.</CardDescription>
          </div>
          <PrintButton />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <nav aria-label="Report sections" className="flex flex-wrap gap-2 print:hidden">
            {r.allowed.map((s) => <Button key={s} size="sm" variant={s === r.section ? "default" : "outline"} nativeButton={false} render={<Link href={`?${qs({ section: s })}`} aria-current={s === r.section ? "page" : undefined} />}>{sectionLabels[s]}</Button>)}
          </nav>
          <form method="get" className="flex flex-wrap items-end gap-4 print:hidden" aria-label="Report filters">
            <input type="hidden" name="section" value={r.section} />
            <div className="flex flex-col gap-2"><Label htmlFor="rp-from">From</Label><Input id="rp-from" name="from" type="date" defaultValue={f.from} /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="rp-to">Through</Label><Input id="rp-to" name="to" type="date" defaultValue={f.to} /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="rp-division">Division</Label><select id="rp-division" name="division" defaultValue={f.division} className={`${selectClass} capitalize`}><option value="">All divisions</option>{["estates", "architecture", "painting", "interiors", "tech"].map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
            <div className="flex flex-col gap-2"><Label htmlFor="rp-project">Project</Label><select id="rp-project" name="projectId" defaultValue={f.projectId} className={`${selectClass} max-w-64`}><option value="">All projects</option>{r.projectOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
            <div className="flex flex-col gap-2"><Label htmlFor="rp-currency">Currency</Label><select id="rp-currency" name="currency" defaultValue={f.currency} className={selectClass}><option value="">UGX and USD (separately)</option><option value="UGX">UGX</option><option value="USD">USD</option></select></div>
            {(r.section === "projects" || r.section === "staff") && <div className="flex flex-col gap-2"><Label htmlFor="rp-search">Search</Label><Input id="rp-search" name="search" type="search" defaultValue={f.search} placeholder={r.section === "staff" ? "Employee" : "Project name or code"} /></div>}
            <Button type="submit">Apply</Button>
            <Button variant="outline" nativeButton={false} render={<Link href={`?section=${r.section}`} />}>Reset</Button>
          </form>
          <p className="text-xs text-muted-foreground">{sectionLabels[r.section]} · period {f.from} to {f.to} (Kampala dates){f.currency ? ` · ${f.currency} only` : ""}. Balances marked “as of today” are not limited to the period.</p>
        </CardContent>
      </Card>
      {r.tables.map((t) => (
        <Card key={t.key} className="break-inside-avoid">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5"><CardTitle>{t.title}</CardTitle><CardDescription>{t.description}</CardDescription></div>
            <Button size="sm" variant="outline" className="print:hidden" nativeButton={false} render={<a href={`/api/reports/export?${qs({ table: t.key })}`} />}>Export CSV</Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {t.rows.length ? (
              <Table>
                <TableHeader><TableRow>{t.columns.map((c) => <TableHead key={c.key} className={c.numeric || c.money ? "text-right" : ""}>{c.label}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {t.rows.map((row, i) => (
                    <TableRow key={i}>
                      {t.columns.map((c) => <TableCell key={c.key} className={c.numeric || c.money ? "text-right tabular-nums" : ""}>{c.money ? formatAmount(String(row.currency ?? ""), String(row[c.key] ?? 0)).replace(/^\s+/, "") : String(row[c.key] ?? "")}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <p className="text-sm text-muted-foreground">No records for these filters.</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
