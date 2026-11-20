"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { PublicIntro } from "@/components/layout/public-intro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Result = { found: false } | { found: true; type: string; number: string; issuer: string; issuedAt: string; status: string; integrity: "match" | "mismatch" | "not_checked" };
const statusLabels: Record<string, string> = { issued: "Valid (issued)", superseded: "Superseded by a newer document", withdrawn: "Withdrawn", expired: "Expired", voided: "Voided", revoked: "Revoked" };
// Hashing happens in this browser; only the 64-character fingerprint is sent. The cap only guards memory.
const MAX_FILE = 50 * 1024 * 1024;

async function fingerprint(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function PublicVerification({ initialReference = "" }: { initialReference?: string }) {
  const [reference, setReference] = useState(initialReference);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const verify = useCallback(async (ref: string, pdf: File | null) => {
    setBusy(true); setError(""); setResult(null);
    try {
      if (pdf && pdf.size > MAX_FILE) { setError("Please choose a PDF no larger than 50 MB."); return; }
      if (pdf && !crypto?.subtle) { setError("This browser cannot check files. Try an up-to-date browser."); return; }
      const headers: Record<string, string> = { "x-verification-reference": ref.trim() };
      if (pdf) headers["x-verification-sha256"] = await fingerprint(pdf);
      const response = await fetch("/api/verify", { method: "POST", cache: "no-store", referrerPolicy: "no-referrer", headers });
      if (response.status === 429) { setError("Too many requests. Please wait a minute and try again."); return; }
      if (!response.ok) throw new Error("unavailable");
      setResult(await response.json() as Result);
    } catch { setError("The verification service is unavailable. Please try again later."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { if (initialReference) void verify(initialReference, null); }, [initialReference, verify]);
  const valid = result?.found && result.status === "issued";
  return (
    <main aria-labelledby="verify-title" className="site-container flex min-h-[80svh] flex-col pt-28 pb-(--section-space) md:pt-32">
      <div className="mx-auto w-full max-w-2xl">
        <PublicIntro id="verify-title" eyebrow="Document verification" title="Verify a Calacot document" description="Check whether Calacot issued a quotation or invoice and whether it is still valid. Add the PDF to confirm that your copy is exactly the one we issued." />
        <form className="mt-10 flex flex-col gap-5 rounded-3xl border border-brand-black-100 bg-brand-white p-6 sm:p-8 dark:border-brand-black-800 dark:bg-brand-black-900" onSubmit={(event) => { event.preventDefault(); void verify(reference, file); }}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="verification-reference">Verification reference</Label>
            <Input id="verification-reference" className="font-mono" value={reference} onChange={(event) => { setReference(event.target.value); setResult(null); }} disabled={busy} required maxLength={43} autoComplete="off" spellCheck={false} aria-describedby="verification-reference-help" />
            <p id="verification-reference-help" className="text-sm text-brand-black-600 dark:text-brand-black-300">Printed at the foot of each page, and opened automatically when you scan the QR code.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="verification-file">PDF file <span className="font-normal text-brand-black-600 dark:text-brand-black-300">(optional)</span></Label>
            <Input id="verification-file" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null); }} aria-describedby="verification-file-help" />
            <p id="verification-file-help" className="text-sm text-brand-black-600 dark:text-brand-black-300">The file is checked on this device and is never uploaded.</p>
          </div>
          <div><Button type="submit" size="lg" disabled={busy}>{busy ? "Checking…" : "Verify document"}</Button></div>
        </form>
        <div className="mt-6" aria-live="polite">
          {error && <p role="alert" className="rounded-2xl border border-destructive/50 p-4 text-base">{error}</p>}
          {result && !result.found && <p className="rounded-2xl border border-brand-black-100 p-4 text-base dark:border-brand-black-800">Reference not recognized. Check it and try again, or contact Calacot.</p>}
          {result?.found && (
            <section aria-labelledby="verification-result" className="flex flex-col gap-5 rounded-3xl border border-brand-black-100 bg-brand-white p-6 sm:p-8 dark:border-brand-black-800 dark:bg-brand-black-900">
              <h2 id="verification-result" className="flex items-center gap-2 text-lg font-medium text-brand-black dark:text-brand-white">
                {valid ? <ShieldCheckIcon aria-hidden className="size-5 text-brand-primary-700 dark:text-brand-primary" /> : <ShieldAlertIcon aria-hidden className="size-5 text-destructive" />}
                {valid ? "Issued by Calacot and currently valid" : "Issued by Calacot, but no longer valid"}
              </h2>
              <dl className="grid gap-4 text-base sm:grid-cols-2">
                <div><dt className="text-sm text-brand-black-600 dark:text-brand-black-300">Document</dt><dd className="capitalize">{result.type} {result.number}</dd></div>
                <div><dt className="text-sm text-brand-black-600 dark:text-brand-black-300">Issuing organization</dt><dd>{result.issuer}</dd></div>
                <div><dt className="text-sm text-brand-black-600 dark:text-brand-black-300">Issue date</dt><dd>{new Date(result.issuedAt).toLocaleDateString("en-UG", { dateStyle: "medium", timeZone: "Africa/Kampala" })}</dd></div>
                <div><dt className="text-sm text-brand-black-600 dark:text-brand-black-300">Current status</dt><dd className="font-medium">{statusLabels[result.status] ?? result.status}</dd></div>
              </dl>
              <p className="flex gap-2 border-t border-brand-black-100 pt-4 text-base dark:border-brand-black-800">
                {result.integrity === "match" && <CheckIcon aria-hidden className="mt-1 size-4 shrink-0 text-brand-primary-700 dark:text-brand-primary" />}
                <span><strong className="font-medium">Your file: </strong>{result.integrity === "match" ? "Exactly matches the PDF Calacot issued." : result.integrity === "mismatch" ? "Does not match the PDF Calacot issued. It may have been altered; do not rely on it." : "Not checked. A recognized reference alone does not prove that your copy is unaltered. Add the PDF above to check it."}</span>
              </p>
              {!valid && <p className="text-base">Contact Calacot before relying on this document.</p>}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
