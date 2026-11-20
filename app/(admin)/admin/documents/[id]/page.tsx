import Link from "next/link";
import { readDocumentDetail } from "@/lib/documents/reads";
import { ArchiveDocument, UploadDocument } from "@/components/documents/document-forms";
import { kindLabels, recordLabels } from "@/lib/documents/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const bytes = (n: string) => { const b = Number(n); return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`; };
const when = (v: string) => new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" }).format(new Date(v));
const actionLabels: Record<string, string> = { "document.upload": "Uploaded", "document.revise": "New version uploaded", "document.archive": "Archived", "document.download": "Downloaded" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { doc, versions, history, can } = await readDocumentDetail(id);
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Link href="/admin/documents" className="text-sm underline-offset-4 hover:underline">Back to documents</Link>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardTitle as="h1" className="break-words">{doc.name}</CardTitle>
            <CardDescription>{kindLabels[doc.kind] ?? doc.kind} · version {doc.version} · {bytes(doc.size_bytes)}</CardDescription>
          </div>
          {doc.archived_at ? <Badge variant="secondary">Archived</Badge> : doc.financial ? <Badge variant="outline">Financial record</Badge> : <Badge>Active</Badge>}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Linked to</dt><dd>{recordLabels[doc.record_type] ?? doc.record_type}: {doc.record_href ? <Link className="underline underline-offset-4" href={doc.record_href}>{doc.record_label}</Link> : doc.record_label}</dd></div>
            <div><dt className="text-muted-foreground">Latest upload</dt><dd>{when(doc.created_at)} by {doc.uploader}</dd></div>
            <div><dt className="text-muted-foreground">Versions</dt><dd>{doc.versions}</dd></div>
          </dl>
          {doc.archived_at && <p className="text-sm">Archived: {doc.archive_reason ?? "No reason recorded"}</p>}
          {doc.financial && <p className="text-sm text-muted-foreground">Quotations, invoices, receipts and expense evidence are managed in their own workflows. They cannot be revised or archived here.</p>}
          <div className="flex flex-wrap gap-2">
            <Button nativeButton={false} render={<a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener" />}>Open latest version</Button>
            {can.revise && <UploadDocument supersedesId={doc.id} />}
            {can.archive && <ArchiveDocument documentId={doc.id} />}
          </div>
        </CardContent>
      </Card>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Version history</CardTitle><CardDescription>Every version is kept unchanged.</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Version</TableHead><TableHead>Uploaded</TableHead><TableHead className="text-right">Size</TableHead><TableHead><span className="sr-only">Open</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {versions.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>v{v.version}<div className="text-xs break-all text-muted-foreground">{v.name}</div></TableCell>
                    <TableCell>{when(v.created_at)}<div className="text-xs text-muted-foreground">{v.uploader}</div></TableCell>
                    <TableCell className="text-right tabular-nums">{bytes(v.size_bytes)}</TableCell>
                    <TableCell><a className="text-sm underline underline-offset-4" href={`/api/documents/${v.id}`} target="_blank" rel="noopener">Open</a></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Activity</CardTitle><CardDescription>Uploads, versions, archival and downloads (most recent 50).</CardDescription></CardHeader>
          <CardContent>
            {history.length ? <ol className="flex flex-col gap-2 text-sm">{history.map((h, i) => <li key={i} className="border-l-2 pl-3"><p className="font-medium">{actionLabels[h.action] ?? h.action}{h.changes?.version ? ` (v${String(h.changes.version)})` : ""}</p><p className="text-muted-foreground">{h.actor}, {when(h.created_at)}{h.changes?.reason ? `. Reason: ${String(h.changes.reason)}` : ""}</p></li>)}</ol> : <p className="text-sm text-muted-foreground">No recorded activity. Older documents may predate document auditing.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
