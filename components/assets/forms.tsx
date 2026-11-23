"use client";
import { useActionState, useState } from "react";
import { PlusIcon } from "lucide-react";
import { prepareDisposal, prepareImpairment, proposeCategory, recordTransfer, saveAsset } from "@/lib/assets/actions";
import { FormDialog, initial } from "@/components/accounting/admin-forms";
import { EvidenceSelect } from "@/components/tax/forms";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";

const newKey = () => crypto.randomUUID();
type Opt = { id: string; name: string };
type Account = { id: string; code: string; name: string; account_type: string; is_contra: boolean };
const divisions = ["estates", "architecture", "painting", "interiors", "tech"];

export function ProposeCategory({ accounts }: { accounts: Account[] }) {
  const [state, action, pending] = useActionState(proposeCategory, initial);
  const [key] = useState(newKey);
  const pick = (name: string, label: string, f: (a: Account) => boolean) => (
    <Field><FieldLabel htmlFor={`pc-${name}`}>{label}</FieldLabel>
      <NativeSelect wrapperClassName="w-full" id={`pc-${name}`} name={name} required defaultValue=""><option value="" disabled>Choose</option>{accounts.filter(f).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</NativeSelect></Field>
  );
  return (
    <FormDialog variant="outline" trigger="Propose category policy" title="Propose an asset category policy" description="Useful life, residual value, convention, threshold and accounts are an accounting policy: enter what the accountant approved. Nothing posts until a different person approves the category." state={state} action={action} pending={pending} submitLabel="Propose">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="pc-code">Code</FieldLabel><Input id="pc-code" name="code" required pattern="[A-Za-z0-9][A-Za-z0-9_\-]{1,19}" placeholder="COMP" /></Field>
          <Field><FieldLabel htmlFor="pc-name">Name</FieldLabel><Input id="pc-name" name="name" required maxLength={120} placeholder="Computer equipment" /></Field>
          <Field><FieldLabel htmlFor="pc-life">Useful life (months)</FieldLabel><Input id="pc-life" name="usefulLifeMonths" required inputMode="numeric" pattern="\d{1,4}" /></Field>
          <Field><FieldLabel htmlFor="pc-res">Residual value (fraction of cost)</FieldLabel><Input id="pc-res" name="residualPercent" required defaultValue="0" pattern="0(\.\d{1,6})?" /></Field>
          <Field><FieldLabel htmlFor="pc-conv">Partial periods</FieldLabel>
            <NativeSelect wrapperClassName="w-full" id="pc-conv" name="periodConvention"><option value="daily_proration">By days in service</option><option value="full_month_from_capitalization">Full month from capitalization</option><option value="next_month_after_capitalization">From the month after capitalization</option></NativeSelect></Field>
          <Field><FieldLabel htmlFor="pc-thr">Capitalization threshold</FieldLabel><Input id="pc-thr" name="capitalizationThreshold" required inputMode="decimal" pattern="\d{1,15}(\.\d{1,2})?" /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {pick("cost", "Cost account (asset)", (a) => a.account_type === "asset" && !a.is_contra)}
          {pick("accumulated", "Accumulated depreciation (contra asset)", (a) => a.account_type === "asset" && a.is_contra)}
          {pick("expense", "Depreciation expense", (a) => ["operating_expense", "cost_of_sales", "other_expense"].includes(a.account_type))}
          {pick("impairment", "Impairment expense", (a) => ["operating_expense", "other_expense"].includes(a.account_type))}
          {pick("gain", "Gain on disposal", (a) => a.account_type === "other_income")}
          {pick("loss", "Loss on disposal", (a) => ["other_expense", "operating_expense"].includes(a.account_type))}
        </div>
        <Field><FieldLabel htmlFor="pc-tax">Capital allowance rule code (tax only, optional)</FieldLabel><Input id="pc-tax" name="taxAllowanceRuleCode" placeholder="ca-computers" /><FieldDescription>Tax capital allowances come from this approved tax rule and are never posted to the ledger.</FieldDescription></Field>
        <Field><FieldLabel htmlFor="pc-basis">Policy basis</FieldLabel><Textarea id="pc-basis" name="policyBasis" required minLength={5} maxLength={1000} /></Field>
      </FieldGroup>
    </FormDialog>
  );
}

type Options = { categories: { code: string; name: string; status: string }[]; staff: Opt[]; projects: Opt[]; suppliers: Opt[]; expenses: { id: string; label: string; net_amount: string; currency: string }[]; accounts: Account[]; documents: Opt[] };
export function AssetForm({ options, today }: { options: Options; today: string }) {
  const [state, action, pending] = useActionState(saveAsset, initial);
  const [key] = useState(newKey);
  const [ownership, setOwnership] = useState<"owned" | "hired">("owned");
  const [source, setSource] = useState("expense_reclass");
  const approved = options.categories.filter((c) => c.status === "approved");
  return (
    <FormDialog trigger={<><PlusIcon data-icon="inline-start" />Register asset</>} title="Register an asset" description="Owned assets are capitalized under an approved category policy. Hired equipment is recorded for custody only. Link the existing purchase instead of entering it again." state={state} action={action} pending={pending} submitLabel="Register">
      <input type="hidden" name="key" value={key} />
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="af-own">Ownership</FieldLabel><NativeSelect wrapperClassName="w-full" id="af-own" name="ownership" value={ownership} onChange={(e) => setOwnership(e.target.value as "owned" | "hired")}><option value="owned">Company-owned</option><option value="hired">Hired equipment</option></NativeSelect></Field>
          <Field><FieldLabel htmlFor="af-name">Name</FieldLabel><Input id="af-name" name="name" required maxLength={160} /></Field>
          <Field><FieldLabel htmlFor="af-acq">Acquisition date</FieldLabel><Input id="af-acq" type="date" name="acquisitionDate" required max={today} /></Field>
          <Field><FieldLabel htmlFor="af-sup">Supplier</FieldLabel><NativeSelect wrapperClassName="w-full" id="af-sup" name="supplierId" defaultValue=""><option value="">None</option>{options.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
        </div>
        {ownership === "owned" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="af-cat">Category</FieldLabel><NativeSelect wrapperClassName="w-full" id="af-cat" name="categoryCode" required defaultValue=""><option value="" disabled>{approved.length ? "Choose an approved category" : "No approved categories"}</option>{approved.map((c) => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}</NativeSelect></Field>
              <Field><FieldLabel htmlFor="af-cost">Cost</FieldLabel><Input id="af-cost" name="cost" required inputMode="decimal" pattern="\d{1,15}(\.\d{1,2})?" /></Field>
              <Field><FieldLabel htmlFor="af-cap">Capitalization date</FieldLabel><Input id="af-cap" type="date" name="capitalizationDate" required max={today} /></Field>
              <Field><FieldLabel htmlFor="af-cur">Currency</FieldLabel><NativeSelect wrapperClassName="w-full" id="af-cur" name="currency"><option value="UGX">UGX</option><option value="USD">USD</option></NativeSelect></Field>
              <Field><FieldLabel htmlFor="af-life">Useful life override (months)</FieldLabel><Input id="af-life" name="usefulLifeMonths" inputMode="numeric" placeholder="Category default" /></Field>
              <Field><FieldLabel htmlFor="af-res">Residual value override</FieldLabel><Input id="af-res" name="residualValue" inputMode="decimal" placeholder="Category default" /></Field>
            </div>
            <Field><FieldLabel htmlFor="af-src">How the cost reached the books</FieldLabel>
              <NativeSelect wrapperClassName="w-full" id="af-src" name="capitalizationSource" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="expense_reclass">Recorded as an expense: reclassify it</option><option value="direct_credit">Owed or paid through another account</option><option value="opening_balance">Opening balance at cut-over</option></NativeSelect>
            </Field>
            {source === "expense_reclass" && <Field><FieldLabel htmlFor="af-exp">Expense</FieldLabel><NativeSelect wrapperClassName="w-full" id="af-exp" name="expenseId" required defaultValue=""><option value="" disabled>Choose the approved expense</option>{options.expenses.map((e) => <option key={e.id} value={e.id}>{e.label} · {e.currency} {e.net_amount}</option>)}</NativeSelect><FieldDescription>Assets linked to one expense can never exceed its net amount.</FieldDescription></Field>}
            {source !== "opening_balance" && <Field><FieldLabel htmlFor="af-cr">Account to credit</FieldLabel><NativeSelect wrapperClassName="w-full" id="af-cr" name="creditAccountId" required defaultValue=""><option value="" disabled>Choose</option>{options.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</NativeSelect><FieldDescription>{source === "expense_reclass" ? "The expense account the purchase was charged to." : "The payable or clearing account."}</FieldDescription></Field>}
            {source === "opening_balance" && <div className="grid gap-3 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="af-oad">Opening accumulated depreciation</FieldLabel><Input id="af-oad" name="openingAccumulatedDepreciation" inputMode="decimal" /></Field>
              <Field><FieldLabel htmlFor="af-ds">Depreciate from</FieldLabel><Input id="af-ds" type="date" name="depreciationStartDate" /><FieldDescription>Usually the cut-over date.</FieldDescription></Field>
            </div>}
          </>
        ) : <Field><FieldLabel htmlFor="af-hire">Hire reference</FieldLabel><Input id="af-hire" name="hireReference" maxLength={100} /></Field>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="af-cust">Custodian</FieldLabel><NativeSelect wrapperClassName="w-full" id="af-cust" name="custodianId" defaultValue=""><option value="">None</option>{options.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="af-loc">Location</FieldLabel><Input id="af-loc" name="location" maxLength={200} /></Field>
          <Field><FieldLabel htmlFor="af-div">Division</FieldLabel><NativeSelect wrapperClassName="w-full" id="af-div" name="division" defaultValue=""><option value="">None</option>{divisions.map((d) => <option key={d} value={d}>{d}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="af-proj">Project</FieldLabel><NativeSelect wrapperClassName="w-full" id="af-proj" name="projectId" defaultValue=""><option value="">None</option>{options.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="af-sn">Serial number</FieldLabel><Input id="af-sn" name="serialNumber" maxLength={100} /></Field>
          <Field><FieldLabel htmlFor="af-doc">Source document</FieldLabel><NativeSelect wrapperClassName="w-full" id="af-doc" name="sourceDocumentId" defaultValue=""><option value="">None</option>{options.documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</NativeSelect></Field>
        </div>
      </FieldGroup>
    </FormDialog>
  );
}

export function ImpairmentForm({ id, documents, today }: { id: string; documents: Opt[]; today: string }) {
  const [state, action, pending] = useActionState(prepareImpairment, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog variant="outline" trigger="Impair or write down" title="Impairment or write-down" description="Reduces the carrying amount with evidence. A different person must approve and post it." state={state} action={action} pending={pending} submitLabel="Prepare">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="key" value={key} />
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="im-amt">Amount</FieldLabel><Input id="im-amt" name="amount" required inputMode="decimal" pattern="\d{1,15}(\.\d{1,2})?" /></Field>
          <Field><FieldLabel htmlFor="im-date">Date</FieldLabel><Input id="im-date" type="date" name="impairmentDate" required max={today} /></Field>
        </div>
        <Field><FieldLabel htmlFor="im-why">Reason</FieldLabel><Textarea id="im-why" name="reason" required minLength={5} maxLength={2000} /></Field>
        <EvidenceSelect documents={documents} />
      </FieldGroup>
    </FormDialog>
  );
}

export function DisposalForm({ id, documents, banks, accounts, today }: { id: string; documents: Opt[]; banks: { id: string; label: string }[]; accounts: Account[]; today: string }) {
  const [state, action, pending] = useActionState(prepareDisposal, initial);
  const [key] = useState(newKey);
  const [into, setInto] = useState("bank");
  return (
    <FormDialog variant="outline" trigger="Dispose" title="Dispose of the asset" description="Depreciation to the disposal date, the carrying amount and the gain or loss are calculated for you. Months before the disposal month must already be depreciated. A different person must approve and post it." state={state} action={action} pending={pending} submitLabel="Prepare disposal">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="key" value={key} />
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="dp-date">Disposal date</FieldLabel><Input id="dp-date" type="date" name="disposalDate" required max={today} /></Field>
          <Field><FieldLabel htmlFor="dp-kind">Type</FieldLabel><NativeSelect wrapperClassName="w-full" id="dp-kind" name="kind">{["sale", "scrap", "write_off", "donation", "loss_or_theft"].map((k) => <option key={k} value={k}>{k.replaceAll("_", " ")}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="dp-pro">Proceeds</FieldLabel><Input id="dp-pro" name="proceeds" inputMode="decimal" placeholder="0" /></Field>
          <Field><FieldLabel htmlFor="dp-into">Proceeds received</FieldLabel><NativeSelect wrapperClassName="w-full" id="dp-into" value={into} onChange={(e) => setInto(e.target.value)}><option value="bank">Into a company account</option><option value="receivable">Still receivable</option></NativeSelect></Field>
        </div>
        {into === "bank" ? <Field><FieldLabel htmlFor="dp-bank">Company account</FieldLabel><NativeSelect wrapperClassName="w-full" id="dp-bank" name="proceedsBankingAccountId" defaultValue=""><option value="">No proceeds</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</NativeSelect></Field>
          : <Field><FieldLabel htmlFor="dp-rec">Receivable account</FieldLabel><NativeSelect wrapperClassName="w-full" id="dp-rec" name="proceedsAccountId" defaultValue=""><option value="">Choose</option>{accounts.filter((a) => a.account_type === "asset" && !a.is_contra).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</NativeSelect></Field>}
        <Field><FieldLabel htmlFor="dp-note">Explanation</FieldLabel><Textarea id="dp-note" name="note" required minLength={5} maxLength={2000} /></Field>
        <EvidenceSelect documents={documents} />
      </FieldGroup>
    </FormDialog>
  );
}

export function TransferForm({ id, options, today }: { id: string; options: Pick<Options, "staff" | "projects">; today: string }) {
  const [state, action, pending] = useActionState(recordTransfer, initial);
  const [key] = useState(newKey);
  return (
    <FormDialog variant="outline" trigger="Transfer" title="Transfer custody, location or division" description="Records who holds the asset and where. Non-financial: later depreciation uses the new division and project." state={state} action={action} pending={pending} submitLabel="Record transfer">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="key" value={key} />
      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="tf-date">Date</FieldLabel><Input id="tf-date" type="date" name="transferDate" required max={today} /></Field>
          <Field><FieldLabel htmlFor="tf-cust">New custodian</FieldLabel><NativeSelect wrapperClassName="w-full" id="tf-cust" name="custodianId" defaultValue=""><option value="">None</option>{options.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="tf-loc">New location</FieldLabel><Input id="tf-loc" name="location" maxLength={200} /></Field>
          <Field><FieldLabel htmlFor="tf-div">Division</FieldLabel><NativeSelect wrapperClassName="w-full" id="tf-div" name="division" defaultValue=""><option value="">None</option>{divisions.map((d) => <option key={d} value={d}>{d}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="tf-proj">Project</FieldLabel><NativeSelect wrapperClassName="w-full" id="tf-proj" name="projectId" defaultValue=""><option value="">None</option>{options.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></Field>
        </div>
        <Field><FieldLabel htmlFor="tf-why">Reason</FieldLabel><Textarea id="tf-why" name="reason" required minLength={5} maxLength={2000} /></Field>
      </FieldGroup>
    </FormDialog>
  );
}
