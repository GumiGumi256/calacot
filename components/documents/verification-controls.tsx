"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeVerificationStatus, registerLegacyVerification } from "@/lib/documents/verification-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type VerificationRecord = { kind: "legacy" | "embedded"; status: string; registered_at: string; pdf_sha256: string; document_number: string } | null;
const statusLabels: Record<string, string> = { issued: "Issued", superseded: "Superseded", withdrawn: "Withdrawn", expired: "Expired", voided: "Voided", revoked: "Revoked" };
const when = (v: string) => new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" }).format(new Date(v));

export function VerificationControls({ documentId, record, canIssue, canRevoke }: { documentId: string; record: VerificationRecord; canIssue: boolean; canRevoke: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState("revoked");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Document verification</CardTitle>
        <CardDescription>
          {record
            ? record.kind === "embedded"
              ? "This PDF carries its own verification reference and QR code, recorded when it was issued."
              : "This existing PDF was registered for verification without being modified."
            : "Not registered. Recipients cannot verify this document yet."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {record && (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Status</dt><dd><Badge variant={record.status === "issued" ? "success" : "danger"}>{statusLabels[record.status] ?? record.status}</Badge></dd></div>
            <div><dt className="text-muted-foreground">Recorded</dt><dd>{when(record.registered_at)} · {record.kind === "embedded" ? "Embedded QR" : "Existing PDF"}</dd></div>
            <div className="min-w-0"><dt className="text-muted-foreground">Recorded SHA-256</dt><dd className="font-mono text-xs break-all">{record.pdf_sha256}</dd></div>
          </dl>
        )}
        {!record && canIssue && (
          <form className="flex flex-col gap-3" onSubmit={(event) => {
            event.preventDefault(); const data = new FormData(event.currentTarget);
            start(async () => {
              const result = await registerLegacyVerification({ documentId, evidence: String(data.get("evidence") ?? "") });
              setMessage(result.ok ? "Registered. Share the reference below with the recipient; it is shown only now." : result.message);
              if (result.ok) { setReference(result.reference); router.refresh(); }
            });
          }}>
            <p className="text-sm text-muted-foreground">Registration keeps the original PDF unchanged. It requires the stored file to match its recorded fingerprint and the quotation or invoice to have its issuance record.</p>
            <Label htmlFor="verification-evidence">Evidence reviewed</Label>
            <Textarea id="verification-evidence" name="evidence" minLength={10} maxLength={2000} required placeholder="What you checked, for example the sent email and the client's copy." />
            <div><Button type="submit" disabled={pending}>Register existing PDF</Button></div>
          </form>
        )}
        {reference && (
          <div className="rounded-lg border p-4 text-sm">
            <p className="text-muted-foreground">Verification reference</p>
            <p className="mt-1 font-mono break-all">{reference}</p>
            <a className="mt-2 inline-block underline underline-offset-4" href={`/verify/${reference}`} target="_blank" rel="noopener noreferrer">Open verification page</a>
          </div>
        )}
        {record?.status === "issued" && canRevoke && (
          <form className="flex flex-col gap-3 border-t pt-5" onSubmit={(event) => {
            event.preventDefault(); const data = new FormData(event.currentTarget);
            start(async () => {
              const result = await changeVerificationStatus({ documentId, status, reason: String(data.get("reason") ?? ""), replacementDocumentId: String(data.get("replacement") ?? "").trim() || undefined });
              setMessage(result.message);
              if (result.ok) router.refresh();
            });
          }}>
            <p className="text-sm text-muted-foreground">Status changes are permanent and shown to anyone who checks this document. A document cannot be returned to issued.</p>
            <Label htmlFor="verification-status">New status</Label>
            <NativeSelect id="verification-status" name="status" wrapperClassName="w-full" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="revoked">Revoked</option>
              <option value="withdrawn">Withdrawn</option>
              <option value="superseded">Superseded by another document</option>
              <option value="expired">Expired (quotations only)</option>
              <option value="voided">Voided (invoices only)</option>
            </NativeSelect>
            <Label htmlFor="verification-reason">Reason</Label>
            <Textarea id="verification-reason" name="reason" minLength={10} maxLength={2000} required />
            {status === "superseded" && <>
              <Label htmlFor="verification-replacement">Replacement document ID</Label>
              <Input id="verification-replacement" name="replacement" required pattern="[0-9a-fA-F-]{36}" autoComplete="off" spellCheck={false} className="font-mono" />
            </>}
            <div><Button type="submit" variant="outline" disabled={pending}>Update status</Button></div>
          </form>
        )}
        {message && <p role="status" className="text-sm">{message}</p>}
      </CardContent>
    </Card>
  );
}
