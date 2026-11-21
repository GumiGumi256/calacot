"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { saveJournal } from "@/lib/accounting/actions";
import { fromMinor, summarizeLines, validateJournal } from "@/lib/accounting/engine";
import { ledgerAmount } from "@/lib/accounting/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { useUnsavedChangesGuard } from "@/components/feedback/use-unsaved-changes";

type Line = { uid: string; accountId: string; description: string; debit: string; credit: string; currency: string; exchangeRateId: string; division: string; projectId: string };
type Option = { id: string; code: string; name: string; status: string; currency: string | null };
type Rate = { id: string; from_currency: string; to_currency: string; rate: string; rate_date: string; source: string };
type Draft = { id: string; version: number; entry_date: string; description: string; reference: string | null; lines: { account_id: string; description: string | null; debit: string; credit: string; currency: string; exchange_rate_id: string | null; division: string | null; project_id: string | null }[] };

const divisions = ["architecture", "interiors", "painting", "estates", "tech"];
const divisionLabels: Record<string, string> = { architecture: "Architecture", interiors: "Interiors", painting: "Painting", estates: "Estates", tech: "Technology" };
const blank = (currency: string): Line => ({ uid: crypto.randomUUID(), accountId: "", description: "", debit: "", credit: "", currency, exchangeRateId: "", division: "", projectId: "" });
const zeroToBlank = (v: string) => (/^0+(\.0+)?$/.test(v) ? "" : v);

export function JournalForm({ requestKey, today, functionalCurrency, accounts, projects, rates, draft }: {
  requestKey: string; today: string; functionalCurrency: string | null; accounts: Option[]; projects: { id: string; label: string; division: string }[]; rates: Rate[]; draft: Draft | null;
}) {
  const router = useRouter();
  const defaultCurrency = functionalCurrency ?? "UGX";
  const [state, action, pending] = useActionState(saveJournal, { ok: false, message: "" });
  const [entryDate, setEntryDate] = useState(draft?.entry_date ?? today);
  const [description, setDescription] = useState(draft?.description ?? "");
  const [reference, setReference] = useState(draft?.reference ?? "");
  const [lines, setLines] = useState<Line[]>(() => draft?.lines.length
    ? draft.lines.map((l) => ({ uid: crypto.randomUUID(), accountId: l.account_id, description: l.description ?? "", debit: zeroToBlank(l.debit), credit: zeroToBlank(l.credit), currency: l.currency, exchangeRateId: l.exchange_rate_id ?? "", division: l.division ?? "", projectId: l.project_id ?? "" }))
    : [blank(defaultCurrency), blank(defaultCurrency)]);
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesGuard(dirty && !state.ok);

  useEffect(() => {
    if (state.ok && state.id) router.push(`/admin/accounting/journals/${state.id}`);
  }, [state, router]);

  const rateById = useMemo(() => new Map(rates.map((r) => [r.id, r])), [rates]);
  const engineLines = lines.map((l) => ({ ...l, exchangeRate: l.exchangeRateId ? rateById.get(l.exchangeRateId)?.rate ?? null : null }));
  const summary = summarizeLines(engineLines.filter((l) => l.debit || l.credit));
  const submitIssues = validateJournal(engineLines.filter((l) => l.debit || l.credit), { stage: "submit" });
  const foreign = lines.some((l) => functionalCurrency && l.currency !== functionalCurrency);

  const update = (uid: string, patch: Partial<Line>) => { setDirty(true); setLines((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...patch } : l))); };
  const payload = JSON.stringify(lines.filter((l) => l.accountId || l.debit || l.credit).map((l) => ({
    accountId: l.accountId, description: l.description, debit: l.debit, credit: l.credit, currency: l.currency, exchangeRateId: l.exchangeRateId, division: l.division, projectId: l.projectId,
  })));

  return (
    <form action={action} className="flex flex-col gap-6" onChange={() => setDirty(true)}>
      <input type="hidden" name="key" value={requestKey} />
      {draft && <input type="hidden" name="id" value={draft.id} />}
      {draft && <input type="hidden" name="version" value={String(draft.version)} />}
      <input type="hidden" name="lines" value={payload} />

      <Card>
        <CardHeader><CardTitle as="h2">Journal details</CardTitle><CardDescription>The accounting date decides the period the journal is posted into.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)_14rem]">
          <Field><FieldLabel htmlFor="j-date">Accounting date</FieldLabel><Input id="j-date" name="entryDate" type="date" required value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="j-desc">Description</FieldLabel><Input id="j-desc" name="description" required maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Reclassify October fuel from admin to site expenses" /></Field>
          <Field><FieldLabel htmlFor="j-ref">Reference (optional)</FieldLabel><Input id="j-ref" name="reference" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Voucher or document no." /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Lines</CardTitle>
          <CardDescription>Enter each amount as a debit or a credit, never both. Division and project are reporting dimensions, not separate accounts.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div aria-hidden className="hidden gap-3 px-3 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[2rem_minmax(14rem,2fr)_minmax(10rem,1.5fr)_9rem_9rem_2.5rem]">
            <span>#</span><span>Account</span><span>Line note</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span />
          </div>
          <ol className="flex flex-col gap-3">
            {lines.map((l, i) => {
              const n = i + 1;
              const pairRates = rates.filter((r) => r.from_currency === l.currency && r.to_currency === functionalCurrency);
              const invalid = summary.invalidLines.length > 0 && (l.debit || l.credit) && ((!!l.debit && !!l.credit) || summarizeLines([{ ...engineLines[i] }]).invalidLines.length > 0);
              return (
                <li key={l.uid} className="rounded-(--card-radius-inner) border border-border p-3" aria-label={`Line ${n}`}>
                  <div className="grid gap-3 lg:grid-cols-[2rem_minmax(14rem,2fr)_minmax(10rem,1.5fr)_9rem_9rem_2.5rem] lg:items-end">
                    <span className="hidden pb-2 text-sm text-muted-foreground lg:block">{n}</span>
                    <Field>
                      <FieldLabel htmlFor={`l-${l.uid}-acc`} className="lg:sr-only">Account (line {n})</FieldLabel>
                      <NativeSelect wrapperClassName="w-full" id={`l-${l.uid}-acc`} value={l.accountId} onChange={(e) => {
                        const acc = accounts.find((a) => a.id === e.target.value);
                        update(l.uid, { accountId: e.target.value, ...(acc?.currency ? { currency: acc.currency, exchangeRateId: "" } : {}) });
                      }}>
                        <option value="">Choose account</option>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}{a.status === "proposed" ? " (awaiting approval)" : ""}{a.currency ? ` [${a.currency}]` : ""}</option>)}
                      </NativeSelect>
                    </Field>
                    <Field><FieldLabel htmlFor={`l-${l.uid}-d`} className="lg:sr-only">Line note (line {n})</FieldLabel><Input id={`l-${l.uid}-d`} maxLength={300} value={l.description} onChange={(e) => update(l.uid, { description: e.target.value })} /></Field>
                    <Field><FieldLabel htmlFor={`l-${l.uid}-dr`} className="lg:sr-only">Debit (line {n})</FieldLabel><Input id={`l-${l.uid}-dr`} inputMode="decimal" className="text-right tabular-nums" value={l.debit} aria-invalid={invalid || undefined} onChange={(e) => update(l.uid, { debit: e.target.value.replace(/[^\d.]/g, ""), credit: e.target.value ? "" : l.credit })} /></Field>
                    <Field><FieldLabel htmlFor={`l-${l.uid}-cr`} className="lg:sr-only">Credit (line {n})</FieldLabel><Input id={`l-${l.uid}-cr`} inputMode="decimal" className="text-right tabular-nums" value={l.credit} aria-invalid={invalid || undefined} onChange={(e) => update(l.uid, { credit: e.target.value.replace(/[^\d.]/g, ""), debit: e.target.value ? "" : l.debit })} /></Field>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${n}`} disabled={lines.length <= 1} onClick={() => { setDirty(true); setLines((ls) => ls.filter((x) => x.uid !== l.uid)); }}><Trash2Icon /></Button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:pl-11">
                    <Field>
                      <FieldLabel htmlFor={`l-${l.uid}-cur`}>Currency</FieldLabel>
                      <NativeSelect wrapperClassName="w-full" id={`l-${l.uid}-cur`} value={l.currency} onChange={(e) => update(l.uid, { currency: e.target.value, exchangeRateId: "" })}>
                        <option value="UGX">UGX</option><option value="USD">USD</option>
                      </NativeSelect>
                    </Field>
                    {functionalCurrency && l.currency !== functionalCurrency && (
                      <Field>
                        <FieldLabel htmlFor={`l-${l.uid}-rate`}>Approved rate to {functionalCurrency}</FieldLabel>
                        <NativeSelect wrapperClassName="w-full" id={`l-${l.uid}-rate`} value={l.exchangeRateId} onChange={(e) => update(l.uid, { exchangeRateId: e.target.value })}>
                          <option value="">No rate selected</option>
                          {pairRates.map((r) => <option key={r.id} value={r.id}>{r.rate} on {r.rate_date} ({r.source})</option>)}
                        </NativeSelect>
                      </Field>
                    )}
                    <Field>
                      <FieldLabel htmlFor={`l-${l.uid}-div`}>Division</FieldLabel>
                      <NativeSelect wrapperClassName="w-full" id={`l-${l.uid}-div`} value={l.division} onChange={(e) => update(l.uid, { division: e.target.value })}>
                        <option value="">None / company-wide</option>
                        {divisions.map((d) => <option key={d} value={d}>{divisionLabels[d]}</option>)}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`l-${l.uid}-proj`}>Project</FieldLabel>
                      <NativeSelect wrapperClassName="w-full" id={`l-${l.uid}-proj`} value={l.projectId} onChange={(e) => {
                        const p = projects.find((x) => x.id === e.target.value);
                        update(l.uid, { projectId: e.target.value, ...(p ? { division: p.division } : {}) });
                      }}>
                        <option value="">No project</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </NativeSelect>
                    </Field>
                  </div>
                </li>
              );
            })}
          </ol>
          <div>
            <Button type="button" variant="outline" size="sm" disabled={lines.length >= 200} onClick={() => { setDirty(true); setLines((ls) => [...ls, blank(ls.at(-1)?.currency ?? defaultCurrency)]); }}><PlusIcon />Add line</Button>
          </div>

          <section aria-labelledby="totals-heading" aria-live="polite" className="rounded-(--card-radius-inner) bg-card-nested p-3 text-sm">
            <h3 id="totals-heading" className="sr-only">Totals</h3>
            {summary.byCurrency.length === 0 ? <p className="text-muted-foreground">Totals appear as you enter amounts.</p> : (
              <dl className="flex flex-col gap-2">
                {summary.byCurrency.map((t) => (
                  <div key={t.currency} className="flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 tabular-nums">
                    <dt className="mr-auto font-medium">{t.currency}</dt>
                    <dd>Debits {ledgerAmount(fromMinor(t.debit))}</dd>
                    <dd>Credits {ledgerAmount(fromMinor(t.credit))}</dd>
                    <dd className={t.difference === BigInt(0) ? "text-success" : "font-medium text-destructive"}>{t.difference === BigInt(0) ? "Balanced" : `Difference ${ledgerAmount(fromMinor(t.difference < BigInt(0) ? -t.difference : t.difference))} ${t.difference > BigInt(0) ? "more debit" : "more credit"}`}</dd>
                  </div>
                ))}
              </dl>
            )}
            {summary.invalidLines.length > 0 && <p className="mt-2 text-destructive">Line {summary.invalidLines.map((i) => i + 1).join(", ")}: enter one positive amount with at most two decimals.</p>}
            {foreign && <p className="mt-2 text-muted-foreground">Lines in a currency other than {functionalCurrency} can be saved as drafts but cannot be posted: multi-currency posting is not enabled.</p>}
            {!functionalCurrency && <p className="mt-2 text-muted-foreground">No functional currency is approved yet, so no exchange rates apply. Drafts can still be prepared.</p>}
          </section>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {state.message && !state.ok && <p role="alert" className="text-sm text-destructive sm:mr-auto">{state.message}</p>}
        {submitIssues.length > 0 && !state.message && <p className="text-sm text-muted-foreground sm:mr-auto">You can save an unbalanced draft. It must balance before it can be submitted.</p>}
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={pending}>{draft ? "Save changes" : "Save draft"}</Button>
      </div>
    </form>
  );
}
