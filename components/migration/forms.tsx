"use client";
import { useActionState, useState } from "react";
import { createMigrationBatch, loadMigrationRows } from "@/lib/migration/actions";
import { migrationSourceSystems, migrationTemplateHeader, parseMigrationTemplate, type MigrationRow } from "@/lib/accounting/migration";
import { FormDialog, Message, initial } from "@/components/accounting/admin-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";

const newKey = () => crypto.randomUUID();

export function CreateBatch() {
  const [state, action, pending] = useActionState(createMigrationBatch, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog trigger="New opening-balance batch" title="Stage opening balances" description="Record where the figures come from and the cutoff date. Rows are staged and reconciled only; nothing is posted to the ledger." state={state} action={action} pending={pending} submitLabel="Create batch">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <Field><FieldLabel htmlFor="mb-src">Source of the figures</FieldLabel>
          <NativeSelect wrapperClassName="w-full" id="mb-src" name="sourceSystem" defaultValue="accountant_schedule">{Object.entries(migrationSourceSystems).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect>
          <FieldDescription>Choose what Calacot actually holds. Do not assume an accounting package was used.</FieldDescription>
        </Field>
        <Field><FieldLabel htmlFor="mb-desc">Description</FieldLabel><Input id="mb-desc" name="sourceDescription" required minLength={5} maxLength={500} placeholder="e.g. Trial balance at 31 Dec prepared by the external accountant" /></Field>
        <Field><FieldLabel htmlFor="mb-cut">Cutoff date (last day before the system takes over)</FieldLabel><Input id="mb-cut" type="date" name="cutoffDate" required /></Field>
        <Field><FieldLabel htmlFor="mb-ev">Evidence reference</FieldLabel><Input id="mb-ev" name="evidenceReference" required minLength={3} maxLength={300} placeholder="Signed schedule, audit file or export name" /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

/** Reads the CSV template in the browser, shows template problems, then sends the rows for staging. */
export function LoadRows({ batchId, version }: { batchId: string; version: number }) {
  const [state, action, pending] = useActionState(loadMigrationRows, initial);
  const [key] = useState(newKey);
  const [rows, setRows] = useState<MigrationRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  if (state.ok) return <p role="status" className="text-sm">{state.message}</p>;
  return (
    <form action={action} className="flex flex-col gap-3" aria-label="Load staging rows">
      <input type="hidden" name="id" value={batchId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="rows" value={rows ? JSON.stringify(rows) : ""} />
      <Field>
        <FieldLabel htmlFor="mr-file">Template file (CSV, UTF-8)</FieldLabel>
        <Input id="mr-file" type="file" accept=".csv,text/csv" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = parseMigrationTemplate(new Uint8Array(await f.arrayBuffer()));
          setErrors(r.errors); setRows(r.errors.length ? null : r.rows);
        }} />
        <FieldDescription>Columns: {migrationTemplateHeader.join(", ")}. Loading replaces all rows of this draft batch.</FieldDescription>
      </Field>
      {errors.length > 0 && <ul role="alert" className="list-disc pl-5 text-sm text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {rows && <p className="text-sm">{rows.length} rows read from the file.</p>}
      <Button type="submit" className="self-start" disabled={!rows} loading={pending}>Stage rows</Button>
      <Message state={state} />
    </form>
  );
}
