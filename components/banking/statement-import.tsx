"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, TriangleAlertIcon, UploadIcon } from "lucide-react";
import { ledgerAmount } from "@/lib/accounting/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Account = { id: string; label: string; currency: string; kind: string; ledger_id: string | null; identifier: string };
type Mapping = Partial<Record<Column, number>>;
type Column = "date" | "description" | "debit" | "credit" | "amount" | "reference" | "currency" | "balance";
type Preview = {
  ok: boolean; message: string; header?: string[]; mapping?: Mapping; sample?: string[][]; rowCount?: number; firstDate?: string; lastDate?: string; currency?: string;
  inflow?: string; outflow?: string; alreadyImported?: string | null; lockedUntil?: string | null; inFinalizedPeriod?: number; possibleDuplicates?: number;
  rows?: { row: number; date: string; description: string; reference: string; amount: string; balance: string | null; duplicate: boolean }[];
  imported?: number; duplicates?: number; review?: number; accountId?: string;
};
const columnLabels: Record<Column, string> = { date: "Date (YYYY-MM-DD)", description: "Description", amount: "Amount (signed: + in, − out)", debit: "Debit / money out", credit: "Credit / money in", reference: "Reference", currency: "Currency", balance: "Running balance" };
const required: Column[] = ["date", "description"];

/**
 * Upload, map, preview, then import. Preview never writes; import is idempotent (same file or same
 * request key) and never creates journals. The server re-validates everything the preview shows.
 */
export function StatementImport({ accounts, initialAccount }: { accounts: Account[]; initialAccount?: string }) {
  const [accountId, setAccountId] = useState(initialAccount && accounts.some((a) => a.id === initialAccount) ? initialAccount : "");
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "import">("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [done, setDone] = useState<Preview | null>(null);
  const account = accounts.find((a) => a.id === accountId);

  const send = async (mode: "preview" | "import", m: Mapping | null) => {
    if (!file || !accountId) return;
    setBusy(mode);
    const body = new FormData();
    body.set("file", file); body.set("bankingAccountId", accountId); body.set("mode", mode); body.set("key", key);
    if (m) body.set("mapping", JSON.stringify(m));
    try {
      const res = await fetch("/api/banking/statements", { method: "POST", body });
      const json = (await res.json()) as Preview;
      if (mode === "import") { setDone(json); if (json.ok) { setPreview(null); setFile(null); setKey(crypto.randomUUID()); } }
      else { setPreview(json); if (json.mapping) setMapping(json.mapping); }
    } catch { (mode === "import" ? setDone : setPreview)({ ok: false, message: "The request failed. Check your connection and try again." }); }
    finally { setBusy(""); }
  };
  const setColumn = (c: Column, v: string) => setMapping((m) => { const n = { ...(m ?? {}) }; if (v === "") delete n[c]; else n[c] = Number(v); return n; });
  const header = preview?.header ?? [];
  const mappingValid = !!mapping && required.every((c) => mapping[c] !== undefined) && (mapping.amount !== undefined) !== (mapping.debit !== undefined && mapping.credit !== undefined);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader><CardTitle as="h2">1. Choose the account and statement</CardTitle><CardDescription>CSV files up to 2 MB and 10,000 rows, UTF-8 encoded. Dates must be YYYY-MM-DD and amounts plain numbers (no thousands separators). Convert other formats to CSV first.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="si-acct">Account</FieldLabel>
              <NativeSelect wrapperClassName="w-full" id="si-acct" value={accountId} onChange={(e) => { setAccountId(e.target.value); setPreview(null); setDone(null); }}>
                <option value="" disabled>Choose a bank or mobile-money account</option>
                {accounts.map((a) => <option key={a.id} value={a.id} disabled={!a.ledger_id}>{a.label} {a.identifier} ({a.currency}){a.ledger_id ? "" : " · mapping not approved"}</option>)}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="si-file">Statement file</FieldLabel>
              <Input id="si-file" type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setMapping(null); setDone(null); }} />
            </Field>
          </FieldGroup>
          <Button className="mt-4" disabled={!file || !accountId} loading={busy === "preview"} onClick={() => send("preview", mapping)}><UploadIcon data-icon="inline-start" />Preview</Button>
        </CardContent>
      </Card>

      {done && (
        <Card variant={done.ok ? "default" : "attention"} tone="destructive">
          <CardContent className="flex flex-col gap-2">
            <p role={done.ok ? "status" : "alert"} className="flex items-start gap-2 text-sm">{done.ok ? <CheckCircle2Icon aria-hidden className="mt-0.5 size-4 text-success" /> : <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 text-destructive" />}{done.message}</p>
            {done.ok && done.accountId && <Button size="sm" variant="outline" className="self-start" render={<Link href={`/admin/accounting/banking/${done.accountId}?view=${Number(done.review) ? "review" : "unmatched"}`} />}>{Number(done.review) ? "Review possible duplicates" : "Match transactions"}</Button>}
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader><CardTitle as="h2">2. Check the column mapping</CardTitle><CardDescription>{preview.ok ? "Columns were matched from the header names. Correct any that are wrong, then preview again." : preview.message}</CardDescription></CardHeader>
          {header.length > 0 && (
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(Object.keys(columnLabels) as Column[]).map((c) => (
                  <Field key={c}>
                    <FieldLabel htmlFor={`map-${c}`}>{columnLabels[c]}{required.includes(c) ? "" : " (optional)"}</FieldLabel>
                    <NativeSelect wrapperClassName="w-full" id={`map-${c}`} value={mapping?.[c] === undefined ? "" : String(mapping[c])} onChange={(e) => setColumn(c, e.target.value)}>
                      <option value="">Not in file</option>
                      {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </NativeSelect>
                  </Field>
                ))}
              </div>
              <FieldDescription>Map either a signed Amount column, or both Debit and Credit. Currency, when present, must be {account?.currency}.</FieldDescription>
              <Button variant="outline" className="self-start" disabled={!mappingValid} loading={busy === "preview"} onClick={() => send("preview", mapping)}>Preview again</Button>
            </CardContent>
          )}
        </Card>
      )}

      {preview?.ok && preview.rows && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">3. Review and import</CardTitle>
            <CardDescription>{preview.rowCount} transactions from {preview.firstDate} to {preview.lastDate} · money in {preview.currency} {ledgerAmount(preview.inflow)} · money out {preview.currency} {ledgerAmount(preview.outflow)}. Importing records the statement only; it never creates journals.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-1 text-sm">
              {preview.alreadyImported && <li className="text-warning">This exact file was already imported on {preview.alreadyImported.slice(0, 10)}. Importing again adds nothing.</li>}
              {!!preview.possibleDuplicates && <li className="text-warning">{preview.possibleDuplicates} row(s) look like lines already imported. Exact repeats are skipped automatically; others will wait for your review.</li>}
              {!!preview.inFinalizedPeriod && <li className="text-warning">{preview.inFinalizedPeriod} row(s) are dated on or before {preview.lockedUntil}, a finalized reconciliation. They will wait for review and cannot be accepted unless that reconciliation is reopened.</li>}
            </ul>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                <TableBody>
                  {preview.rows.map((r) => (
                    <TableRow key={r.row} className={r.duplicate ? "bg-warning/10" : undefined}>
                      <TableCell className="tabular-nums">{r.row}</TableCell><TableCell className="whitespace-nowrap">{r.date}</TableCell>
                      <TableCell className="min-w-48">{r.description}{r.duplicate && <span className="block text-xs text-warning">Possible duplicate</span>}</TableCell>
                      <TableCell>{r.reference}</TableCell><TableCell className="text-right tabular-nums">{ledgerAmount(r.amount)}</TableCell><TableCell className="text-right tabular-nums">{ledgerAmount(r.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {preview.rowCount! > preview.rows.length && <p className="text-sm text-muted-foreground">Showing the first {preview.rows.length} of {preview.rowCount} rows.</p>}
            <Button className="self-start" disabled={!mappingValid} loading={busy === "import"} onClick={() => send("import", mapping)}>Import {preview.rowCount} transactions</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
