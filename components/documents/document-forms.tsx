"use client";
import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveDocument } from "@/lib/documents/actions";
import { kindLabels, recordLabels } from "@/lib/documents/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
const MAX = 20 * 1024 * 1024;
const uploadKinds = ["contract", "drawing", "brief", "permit", "photo", "report", "policy", "staff_record", "property_document", "other"];
type Target = { id: string; label: string };

/**
 * New document (choose category and record) or new version (supersedesId). Files go to the
 * private upload route; the server validates content, size, permissions and the record.
 */
export function UploadDocument({ targets, fixed, supersedesId, triggerLabel }: {
  targets?: Partial<Record<string, Target[]>>; fixed?: { type: string; id: string; label: string }; supersedesId?: string; triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const types = useMemo(() => Object.entries(targets ?? {}).filter(([, v]) => v && v.length).map(([k]) => k), [targets]);
  const [linkType, setLinkType] = useState(fixed?.type ?? types[0] ?? "");
  const file = useRef<HTMLInputElement>(null);
  const revision = !!supersedesId;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setMessage(null); }}>
      <DialogTrigger render={<Button variant={revision ? "outline" : "default"} />}>{triggerLabel ?? (revision ? "Upload new version" : "Upload document")}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{revision ? "Upload a new version" : "Upload a document"}</DialogTitle>
          <DialogDescription>{revision ? "The current version is kept unchanged in the version history." : "Files are stored privately and can only be opened by people allowed to see the linked record."}</DialogDescription>
        </DialogHeader>
        {message?.ok ? (
          <div className="flex flex-col gap-3"><p role="status" className="text-sm">{message.text}</p><DialogFooter><Button type="button" onClick={() => setOpen(false)}>Close</Button></DialogFooter></div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const f = file.current?.files?.[0];
            if (!f) { setMessage({ ok: false, text: "Choose a file." }); return; }
            if (f.size > MAX) { setMessage({ ok: false, text: "Files must be 20 MB or smaller." }); return; }
            const body = new FormData();
            body.set("file", f);
            body.set("documentId", crypto.randomUUID());
            body.set("name", String(form.get("name") ?? ""));
            if (revision) body.set("supersedesId", supersedesId!);
            else { body.set("kind", String(form.get("kind") ?? "")); body.set("linkType", linkType); body.set("linkId", fixed?.id ?? String(form.get("linkId") ?? "")); }
            start(async () => {
              try {
                const res = await fetch("/api/documents", { method: "POST", body });
                const json = (await res.json().catch(() => ({}))) as { message?: string };
                setMessage({ ok: res.ok, text: json.message ?? (res.ok ? "Uploaded." : "Upload failed.") });
                if (res.ok) router.refresh();
              } catch { setMessage({ ok: false, text: "Upload failed. Check your connection and try again." }); }
            });
          }}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="doc-file">File</FieldLabel>
                <Input ref={file} id="doc-file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp,.docx,.xlsx" aria-describedby="doc-file-hint" />
                <FieldDescription id="doc-file-hint">PDF, JPEG, PNG, WebP, Word (.docx) or Excel (.xlsx), up to 20 MB.</FieldDescription>
              </Field>
              <Field><FieldLabel htmlFor="doc-name">Document name (optional)</FieldLabel><Input id="doc-name" name="name" maxLength={150} placeholder="Defaults to the file name" /></Field>
              {!revision && (
                <>
                  <Field>
                    <FieldLabel htmlFor="doc-kind">Category</FieldLabel>
                    <NativeSelect wrapperClassName="w-full" id="doc-kind" name="kind" required defaultValue="">
                      <option value="" disabled>Select a category</option>
                      {uploadKinds.map((k) => <option key={k} value={k}>{kindLabels[k]}</option>)}
                    </NativeSelect>
                  </Field>
                  {fixed ? (
                    <p className="text-sm">Linked to: <span className="font-medium">{fixed.label}</span></p>
                  ) : (
                    <>
                      <Field>
                        <FieldLabel htmlFor="doc-link-type">Belongs to</FieldLabel>
                        <NativeSelect wrapperClassName="w-full" id="doc-link-type" value={linkType} onChange={(e) => setLinkType(e.target.value)}>
                          {types.map((t) => <option key={t} value={t}>{recordLabels[t]}</option>)}
                        </NativeSelect>
                      </Field>
                      {linkType !== "company" && (
                        <Field>
                          <FieldLabel htmlFor="doc-link">{recordLabels[linkType] ?? "Record"}</FieldLabel>
                          <NativeSelect wrapperClassName="w-full" key={linkType} id="doc-link" name="linkId" required defaultValue="">
                            <option value="" disabled>Select…</option>
                            {(targets?.[linkType] ?? []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </NativeSelect>
                        </Field>
                      )}
                    </>
                  )}
                </>
              )}
            </FieldGroup>
            <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Uploading..." : revision ? "Upload version" : "Upload"}</Button></DialogFooter>
            {message && !message.ok && <p role="alert" className="text-sm text-destructive">{message.text}</p>}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ArchiveDocument({ documentId }: { documentId: string }) {
  const [state, action, pending] = useActionState(archiveDocument, { ok: false, message: "" });
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" className="text-destructive" />}>Archive</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Archive this document?</DialogTitle><DialogDescription>All versions are archived together. Nothing is deleted: archived documents stay in the archive view and audit history.</DialogDescription></DialogHeader>
        {state.ok ? <div className="flex flex-col gap-3"><p role="status" className="text-sm">{state.message}</p><DialogFooter><Button type="button" onClick={() => setOpen(false)}>Close</Button></DialogFooter></div> : (
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="documentId" value={documentId} />
            <Field><FieldLabel htmlFor="archive-reason">Reason</FieldLabel><Textarea id="archive-reason" name="reason" required minLength={5} maxLength={1000} /></Field>
            <DialogFooter><Button type="submit" variant="destructive" disabled={pending}>{pending ? "Archiving..." : "Archive document"}</Button></DialogFooter>
            {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
