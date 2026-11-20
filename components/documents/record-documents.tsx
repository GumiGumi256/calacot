import Link from "next/link";
import { staffContext } from "@/lib/sales/permissions";
import { documentsForRecord } from "@/lib/documents/reads";
import { canWriteLink } from "@/lib/documents/access";
import { UploadDocument } from "./document-forms";
import { kindLabels, recordLabels } from "@/lib/documents/labels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Documents for a client or project (including its tasks and milestones), shown in that workspace. */
export async function RecordDocuments({ type, id, label }: { type: "client" | "project"; id: string; label: string }) {
  const ctx = await staffContext();
  const rows = await documentsForRecord(ctx, type, id);
  if (!rows) return null;
  const canUpload = canWriteLink(ctx, type);
  return (
    <Card className={type === "project" ? "lg:col-span-2" : ""}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Documents</CardTitle>
          <CardDescription>{type === "project" ? "Files linked to this project, its tasks and milestones." : "Files linked to this client."} Only documents you may access are listed.</CardDescription>
        </div>
        {canUpload && <UploadDocument fixed={{ type, id, label }} triggerLabel="Upload" />}
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <ul className="divide-y text-sm">
            {rows.map((d) => (
              <li key={d.root} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0"><Link className="font-medium break-words underline-offset-4 hover:underline" href={`/admin/documents/${d.id}`}>{d.name}</Link><span className="block text-xs text-muted-foreground">{kindLabels[d.kind] ?? d.kind} · {recordLabels[d.record_type] ?? d.record_type}: {d.record_label} · v{d.version}</span></span>
                <a className="text-xs underline underline-offset-4" href={`/api/documents/${d.id}`} target="_blank" rel="noopener">Open</a>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No documents yet.</p>}
        <p className="mt-3 text-xs"><Link className="underline underline-offset-4" href={`/admin/documents?${type === "project" ? `projectId=${id}` : `record=client&search=${encodeURIComponent(label)}`}`}>Open in Documents</Link></p>
      </CardContent>
    </Card>
  );
}
