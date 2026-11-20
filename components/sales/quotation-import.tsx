"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2Icon, CircleAlertIcon, DownloadIcon, FileUpIcon, RotateCcwIcon, UploadIcon } from "lucide-react";
import { importColumns, parseQuotationImport, templateCsv } from "@/lib/sales/quote-import";
import { previewQuotationImport, runQuotationImport, type ImportClientMatch, type ImportResult } from "@/lib/sales/quote-import-actions";
import { formatDate, formatMoney } from "@/lib/format";
import { notify } from "@/components/feedback/notify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/*
 * Import quotations from a CSV: choose a file (or paste), review what will be created, import.
 * Nothing is written until "Import"; each quotation then succeeds or fails on its own.
 */
export function QuotationImport({ taxRate }: { taxRate: string }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [matches, setMatches] = useState<Record<string, ImportClientMatch>>({});
  const [previewError, setPreviewError] = useState("");
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [checking, startCheck] = useTransition();
  const [importing, startImport] = useTransition();
  const parsed = useMemo(() => (text.trim() ? parseQuotationImport(text, taxRate) : null), [text, taxRate]);
  const ready = parsed?.quotes.filter((q) => !q.problems.length) ?? [];
  const blocked = parsed?.quotes.filter((q) => q.problems.length) ?? [];
  const importable = ready.filter((q) => matches[q.ref]?.status !== "ambiguous");

  const load = (value: string, name = "") => {
    setText(value);
    setFileName(name);
    setResults(null);
    setMatches({});
    setPreviewError("");
    if (!value.trim()) return;
    startCheck(async () => {
      const r = await previewQuotationImport(value);
      if (r.ok) setMatches(Object.fromEntries(r.matches.map((m) => [m.ref, m])));
      else setPreviewError(r.error);
    });
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([`﻿${templateCsv}\r\n`], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "calacot-quotation-import-template.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  if (results) {
    const done = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    return (
      <section aria-labelledby="import-results" className="flex flex-col gap-4">
        <div className="surface-card flex flex-col gap-4 p-4 sm:p-6">
          <h2 id="import-results" className="flex items-center gap-2 type-section-title">
            {failed.length ? <CircleAlertIcon aria-hidden className="size-5 text-warning" /> : <CheckCircle2Icon aria-hidden className="size-5 text-success" />}
            {done.length} of {results.length} quotation{results.length === 1 ? "" : "s"} imported as drafts
          </h2>
          <p className="type-description">Imported quotations are drafts: review each one, then send it from its page. Nothing has been emailed.</p>
          <ul className="flex flex-col divide-y divide-border">
            {results.map((r) => (
              <li key={r.ref} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="font-medium tabular-nums">{r.ref}</span>
                {r.ok ? (
                  <span className="flex items-center gap-3">
                    {r.clientCreated && <Badge variant="outline">New client</Badge>}
                    <Link href={`/admin/quotations/${r.quotationId}`} className="text-sm font-medium underline underline-offset-4">Open draft</Link>
                  </span>
                ) : (
                  <span className="max-w-xl text-sm text-destructive-text">{r.error}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href="/admin/quotations?status=draft" />}>View drafts</Button>
          <Button variant="outline" onClick={() => load("")}><RotateCcwIcon /> Import another file</Button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="import-source" className="surface-card flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="import-source" className="type-section-title">1. Choose your file</h2>
            <p className="type-description max-w-prose">A CSV with one row per line item. Rows with the same quote reference become one quotation. Save Excel sheets as “CSV UTF-8”.</p>
          </div>
          <Button type="button" variant="outline" onClick={downloadTemplate}><DownloadIcon /> Download template</Button>
        </div>
        <label className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-(--card-radius-inner) border border-dashed border-border bg-card-nested px-4 py-8 text-center outline-none transition-colors hover:border-ring has-focus-visible:ring-2 has-focus-visible:ring-ring motion-reduce:transition-none")}>
          <FileUpIcon aria-hidden className="size-6 text-muted-foreground" />
          <span className="font-medium">{fileName ? `${fileName} · choose another` : "Choose a CSV file"}</span>
          <span className="type-caption">Up to 1 MB, 2,000 rows and 200 quotations</span>
          <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(await f.text(), f.name); e.target.value = ""; }} />
        </label>
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium underline-offset-4 hover:underline">Or paste rows from a spreadsheet</summary>
          <div className="mt-3 flex flex-col gap-2">
            <label htmlFor="import-paste" className="sr-only">Rows to import</label>
            <Textarea id="import-paste" rows={6} className="font-mono text-xs" value={fileName ? "" : text} onChange={(e) => load(e.target.value)} placeholder={importColumns.map((c) => c.key).join("\t")} />
          </div>
        </details>
        <details>
          <summary className="cursor-pointer text-sm font-medium underline-offset-4 hover:underline">Column guide</summary>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
            {importColumns.map((c) => (
              <div key={c.key} className="contents">
                <dt className="font-mono text-xs">{c.key}{c.required && <span className="text-destructive-text"> *</span>}</dt>
                <dd className="text-muted-foreground">{c.note}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>

      {parsed && (
        <section aria-labelledby="import-review" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="import-review" className="type-section-title">2. Review</h2>
            <p aria-live="polite" className="type-description">
              {parsed.fileErrors.length && !parsed.quotes.length ? parsed.fileErrors[0] : (
                <>
                  {ready.length} quotation{ready.length === 1 ? "" : "s"} ready
                  {blocked.length > 0 && <>, {blocked.length} with problems (skipped)</>}
                  {checking && " · checking clients…"}
                </>
              )}
            </p>
            {previewError && <p role="alert" className="text-sm text-destructive-text">{previewError}</p>}
            {parsed.fileErrors.length > 0 && parsed.quotes.length > 0 && (
              <ul className="list-disc pl-5 type-caption">{parsed.fileErrors.slice(0, 10).map((e) => <li key={e}>{e}</li>)}</ul>
            )}
          </div>

          {parsed.quotes.length > 0 && (
            <div className="surface-card overflow-x-auto">
              <Table aria-label="Quotations to import" className="min-w-[48rem] [&_td]:align-top">
                <TableHeader className="bg-surface-subtle">
                  <TableRow className="hover:bg-transparent">
                    {["Reference", "Client", "Title", "Lines", "Total", "Valid until", "Status"].map((h, i) => (
                      <TableHead key={h} className={cn("h-10 px-3 type-table-head first:pl-4", (i === 3 || i === 4) && "text-right")}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.quotes.map((q) => {
                    const m = matches[q.ref];
                    return (
                      <TableRow key={q.ref}>
                        <TableCell className="px-3 py-3 pl-4 font-medium tabular-nums">{q.ref}</TableCell>
                        <TableCell className="max-w-56 px-3 py-3 whitespace-normal">
                          <div>{q.client.name || "—"}</div>
                          <div className="type-caption break-all">{q.client.email}</div>
                          {!q.problems.length && (
                            <div className="mt-1">
                              {m?.status === "existing" ? <Badge variant="secondary">Existing: {m.clientName}</Badge> : m?.status === "new" ? <Badge variant="outline">New client</Badge> : m?.status === "ambiguous" ? <Badge variant="destructive">Several matches</Badge> : null}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-64 px-3 py-3 whitespace-normal">{q.title}<div className="type-caption">{q.division} · {q.currency}</div></TableCell>
                        <TableCell className="px-3 py-3 text-right tabular-nums">{q.items.length}</TableCell>
                        <TableCell className="px-3 py-3 text-right tabular-nums">{q.total ? formatMoney(q.currency, q.total) : "—"}</TableCell>
                        <TableCell className="px-3 py-3">
                          {/* validUntil is the end of that day in UTC; show the calendar date, not Kampala's next morning. */}
                          {formatDate(`${q.validUntil.slice(0, 10)}T09:00:00Z`)}
                          {q.validityAdjusted && !q.problems.length && <div className="type-caption text-warning">Set to 30 days from today</div>}
                        </TableCell>
                        <TableCell className="max-w-72 px-3 py-3 whitespace-normal">
                          {q.problems.length ? (
                            <ul className="flex flex-col gap-1 text-sm text-destructive-text">{q.problems.slice(0, 3).map((p) => <li key={p}>{p}</li>)}{q.problems.length > 3 && <li>and {q.problems.length - 3} more</li>}</ul>
                          ) : m?.status === "ambiguous" ? (
                            <span className="text-sm text-destructive-text">Several existing clients match. Add this one by hand.</span>
                          ) : (
                            <span className="text-sm text-success">Ready</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={!importable.length || checking}
              loading={importing}
              onClick={() =>
                startImport(async () => {
                  const r = await runQuotationImport(text);
                  if (!r.ok) return void notify.error(r.error);
                  setResults(r.results);
                  const n = r.results.filter((x) => x.ok).length;
                  if (n) notify.success(`${n} quotation draft${n === 1 ? "" : "s"} imported`);
                })
              }
            >
              <UploadIcon /> {importing ? "Importing…" : `Import ${importable.length} quotation${importable.length === 1 ? "" : "s"}`}
            </Button>
            <p className="type-caption max-w-prose">Each quotation is saved as a draft with its own planned project. Clients are matched by email, phone or name, or created. Nothing is sent.</p>
          </div>
        </section>
      )}
    </div>
  );
}
