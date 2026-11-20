import Link from "next/link";
import { readDocuments, uploadTargets, documentKinds } from "@/lib/documents/reads";
import { UploadDocument } from "@/components/documents/document-forms";
import { kindLabels, recordLabels } from "@/lib/documents/labels";
import { FilterBar, Pager } from "@/components/admin/list-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const formatBytes = (n: string | number) => { const b = Number(n); return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`; };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const d = await readDocuments(await searchParams);
  const upload = d.can.write ? await uploadTargets() : null;
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle as="h1">Documents</CardTitle>
            <CardDescription>Contracts, drawings, permits and other files linked to clients, projects, tasks, milestones, employees and company records. You only see documents for records you can access.</CardDescription>
          </div>
          {upload && <UploadDocument targets={upload.targets} />}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FilterBar reset="?" values={d.filters} hidden={{ projectId: d.filters.projectId }} fields={[
            { name: "search", label: "Search", type: "search" },
            { name: "kind", label: "Category", type: "select", options: documentKinds },
            { name: "record", label: "Linked to", type: "select", options: ["client", "project", "task", "milestone", "staff", "company", "expense", "invoice", "quotation"] },
            { name: "status", label: "Status", type: "select", options: ["active", "archived"] },
            { name: "from", label: "Uploaded from", type: "date" },
            { name: "to", label: "Uploaded through", type: "date" },
          ]} />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Category</TableHead><TableHead>Linked record</TableHead><TableHead>Uploaded</TableHead><TableHead className="text-right">Version</TableHead><TableHead className="text-right">Size</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{d.filters.status === "archived" ? "No archived documents match these filters." : "No documents match these filters."}</TableCell></TableRow>}
                {d.rows.map((r) => (
                  <TableRow key={r.root}>
                    <TableCell className="max-w-72"><Link className="font-medium break-words underline-offset-4 hover:underline" href={`/admin/documents/${r.id}`}>{r.name}</Link></TableCell>
                    <TableCell>{kindLabels[r.kind] ?? r.kind}</TableCell>
                    <TableCell className="max-w-56"><span className="text-xs text-muted-foreground">{recordLabels[r.record_type] ?? r.record_type}</span><div className="break-words">{r.record_href ? <Link className="underline-offset-4 hover:underline" href={r.record_href}>{r.record_label}</Link> : r.record_label}</div></TableCell>
                    <TableCell>{r.created_at.slice(0, 10)}<div className="text-xs text-muted-foreground">{r.uploader}</div></TableCell>
                    <TableCell className="text-right tabular-nums">v{r.version}{r.versions > 1 ? ` of ${r.versions}` : ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBytes(r.size_bytes)}</TableCell>
                    <TableCell>{r.archived_at ? <Badge variant="secondary">Archived</Badge> : r.financial ? <Badge variant="outline">Financial record</Badge> : <Badge>Active</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager path="" params={{ ...d.filters, size: String(d.size) }} page={d.page} size={d.size} total={d.total} />
        </CardContent>
      </Card>
    </div>
  );
}
