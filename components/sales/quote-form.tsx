"use client";
import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import { quoteSchema, divisions, currencies } from "@/lib/sales/contracts";
import { saveQuote, getPickers } from "@/lib/sales/actions";
import { totals } from "@/lib/sales/money";
import { AGREED_ON_APPROVAL, allocateStages, formatPercent, HUNDRED, isAgreedOnApproval, percentBasis, percentTotal, percentsFromAmounts, stagePresets } from "@/lib/sales/stages";
import { Button } from "@/components/ui/button";
import { CheckIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useUnsavedChangesGuard } from "@/components/feedback/use-unsaved-changes";
import { notify } from "@/components/feedback/notify";
import { formatMoney } from "@/lib/format";
import { TextField, ChoiceField, FormMessage } from "./form-controls";
import { ProjectForm } from "./project-form";
import { QuoteLines, customLine, lineKey, type QuoteLine } from "./quote-lines";
/** A payment stage as edited: the amount is derived from `percent` and the total (see lib/sales/stages). */
type StageDraft = z.input<typeof quoteSchema>["schedules"][number] & { percent: string };
type QuoteInput = Omit<z.input<typeof quoteSchema>, "items" | "schedules"> & {
  items: QuoteLine[];
  schedules: StageDraft[];
  /** Editor-only: "agreed" saves one full-total stage labelled AGREED_ON_APPROVAL (lib/sales/stages). */
  paymentMode: "agreed" | "stages";
};
const defaultStages = (): StageDraft[] => [{ label: "Full payment", amount: "0", dueAt: "", percent: "100" }];
export type QuoteCapabilities = { pick: boolean; override: boolean; manage: boolean };
type Pickers = {
  clients: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  owners: Record<string, unknown>[];
};
export function QuoteForm({
  initial,
  pickers,
  taxRate,
  can,
  lineRefs = [],
}: {
  initial?: z.input<typeof quoteSchema>;
  pickers: Pickers;
  taxRate: string;
  can: QuoteCapabilities;
  /** Catalogue reference price per saved line ("" for custom or older lines). */
  lineRefs?: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [data, setData] = useState(pickers);
  const [search, setSearch] = useState("");
  const [projectOpen, setProjectOpen] = useState(false);
  const [form, setForm] = useState<QuoteInput>(
    () =>
      (initial && {
        ...initial,
        items: initial.items.map((item, i) => ({
          ...item,
          _key: lineKey(),
          _ref: item.catalogueItemId ? lineRefs[i] || undefined : undefined,
          _scope: item.catalogueItemId ? `${initial.division}|${initial.currency}` : undefined,
        })),
        paymentMode: isAgreedOnApproval(initial.schedules) ? "agreed" : "stages",
        schedules: (() => {
          if (isAgreedOnApproval(initial.schedules)) return defaultStages();
          let savedTotal = "";
          try { savedTotal = totals(initial.items, taxRate).total; } catch {}
          const percents = percentsFromAmounts(initial.schedules.map((s) => s.amount), savedTotal);
          return initial.schedules.map((s, i) => ({ ...s, percent: percents[i] }));
        })(),
      }) || {
        revision: 0,
        clientId: "",
        projectId: "",
        contactId: "",
        title: "",
        division: "painting",
        currency: "UGX",
        scope: "",
        deliverables: [],
        exclusions: [],
        terms: "",
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        items: [customLine(taxRate)],
        // Payment stages are optional: new quotations start with terms agreed on approval.
        paymentMode: "agreed",
        schedules: defaultStages(),
      },
  );
  const snapshot = (value: QuoteInput) => JSON.stringify({ ...value, items: value.items.map(({ _key, ...rest }) => (void _key, rest)) });
  const [baseline, setBaseline] = useState(() => snapshot(form));
  const dirty = snapshot(form) !== baseline;
  useUnsavedChangesGuard(dirty && !pending);
  const update = (key: keyof QuoteInput, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      void getPickers(form.clientId || undefined, search)
        .then((r) => {
          if (active) setData(r);
        })
        .catch(() => {
          if (active) setMessage("Could not load client and project options.");
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [form.clientId, search]);
  let total = "—";
  try {
    total = totals(form.items, taxRate).total;
  } catch {}
  // Stage amounts come from the percentages and the live total, rounded, with the last stage taking
  // the rounding difference, so they always add up to the total exactly (the server requires it).
  const percents = form.schedules.map((s) => s.percent);
  const percentSum = percentTotal(percents);
  const stageAmounts = total === "—" ? null : allocateStages(total, percents, form.currency);
  const stagesProblem =
    percentSum === null ? "Enter each stage as a percentage, e.g. 30 or 12.5."
    : percentSum !== HUNDRED ? `The stages add up to ${formatPercent(percentSum)}%. They must add up to 100%.`
    : percents.some((p) => (percentBasis(p) ?? BigInt(0)) <= BigInt(0)) ? "Every stage needs a percentage above 0."
    : "";
  const setStage = (index: number, patch: Partial<StageDraft>) =>
    update("schedules", form.schedules.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const remaining = percentSum !== null && percentSum < HUNDRED ? formatPercent(HUNDRED - percentSum) : "0";
  const titleCase = (v: string) => v[0].toUpperCase() + v.slice(1);
  return (
    <>
      <form
        className="flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const undescribed = form.items.findIndex((l) => !l.description.trim());
            if (undescribed >= 0) {
              setMessage(`Line ${undescribed + 1} needs a description.`);
              return;
            }
            if (total === "—") {
              setMessage("Check the line items: every line needs a quantity above zero and valid amounts.");
              return;
            }
            let schedules: z.input<typeof quoteSchema>["schedules"];
            if (form.paymentMode === "agreed") {
              schedules = [{ label: AGREED_ON_APPROVAL, amount: total, dueAt: "" }];
            } else {
              if (!stageAmounts) {
                setMessage(stagesProblem || "The payment stages could not be calculated.");
                return;
              }
              const unnamed = form.schedules.findIndex((s) => !s.label.trim());
              if (unnamed >= 0) {
                setMessage(`Give payment stage ${unnamed + 1} a name, e.g. Deposit.`);
                return;
              }
              schedules = form.schedules.map(({ percent, ...stage }, i) => (void percent, { ...stage, amount: stageAmounts[i] }));
            }
            const { paymentMode, ...rest } = form;
            void paymentMode;
            const r = await saveQuote({ ...rest, schedules });
            if (r.ok) {
              setBaseline(snapshot(form));
              notify.success(initial ? "Draft saved" : "Quotation draft created");
              router.push(`/admin/quotations/${r.value}`);
              router.refresh();
            } else setMessage(r.error);
          });
        }}
      >
        <Section step={1} id="quote-client" title="Client and project" description="Who the quotation is for, and the planned project it prices.">
          <TextField label="Search clients" value={search} onChange={setSearch} placeholder="Type a name to narrow the list" />
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <ChoiceField
              label="Client"
              value={form.clientId}
              onChange={(v) => setForm((f) => ({ ...f, clientId: v, projectId: "", contactId: "" }))}
              options={data.clients.map((c) => ({ value: String(c.id), label: String(c.name) }))}
            />
            <ChoiceField
              label="Delivery contact"
              value={form.contactId}
              onChange={(v) => update("contactId", v)}
              hint={form.clientId && !data.contacts.length ? "This client has no contact with an email yet." : "The quotation is emailed to this person."}
              options={data.contacts.map((c) => ({ value: String(c.id), label: `${c.name} · ${c.email}` }))}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <ChoiceField
                label="Planned project"
                value={form.projectId}
                onChange={(v) => {
                  const p = data.projects.find((p) => p.id === v);
                  setForm((f) => ({
                    ...f,
                    projectId: v,
                    division: (p?.division || f.division) as QuoteInput["division"],
                    currency: (p?.currency || f.currency) as QuoteInput["currency"],
                  }));
                }}
                options={data.projects.map((p) => ({ value: String(p.id), label: String(p.name) }))}
              />
            </div>
            <Button type="button" variant="outline" disabled={!form.clientId} onClick={() => setProjectOpen(true)}>
              <PlusIcon /> New project
            </Button>
          </div>
        </Section>

        <Section step={2} id="quote-details" title="Quotation details" description="What the client sees at the top of the quotation.">
          <TextField label="Quotation title" value={form.title} onChange={(v) => update("title", v)} required />
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <ChoiceField label="Division" value={form.division} onChange={(v) => update("division", v)} options={divisions.map((value) => ({ value, label: titleCase(value) }))} hint="Set by the project; it decides which catalogue items you can add." />
            <ChoiceField label="Currency" value={form.currency} onChange={(v) => update("currency", v)} options={currencies.map((value) => ({ value, label: value }))} />
          </div>
          <TextField label="Scope" value={form.scope} onChange={(v) => update("scope", v)} multiline required />
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <TextField label="Deliverables" hint="One per line." value={form.deliverables.join("\n")} onChange={(v) => update("deliverables", v.split("\n"))} multiline />
            <TextField label="Exclusions" hint="One per line." value={form.exclusions.join("\n")} onChange={(v) => update("exclusions", v.split("\n"))} multiline />
          </div>
        </Section>

        <Section step={3} id="quote-lines" title="Line items" description={`Prices in ${form.currency}. Tax of ${taxRate}% applies to every line; the server recalculates every total.`}>
          <QuoteLines
            lines={form.items}
            onChange={(items) => setForm((f) => ({ ...f, items }))}
            division={form.division}
            currency={form.currency}
            taxRate={taxRate}
            canOverride={can.override}
            canManage={can.manage}
            canPick={can.pick}
          />
        </Section>

        <Section step={4} id="quote-stages" title="Payment" description="Payment stages are optional. Leave them to be agreed with the client, or split the total now.">
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">How will the client pay?</legend>
            {([
              ["agreed", "Agree on approval", "No schedule on the quotation. Payment terms are settled with the client once they approve."],
              ["stages", "Set payment stages", "Split the total by percentage, e.g. a deposit and a balance on completion."],
            ] as const).map(([value, title, hint]) => (
              <label key={value} className={cn("flex cursor-pointer gap-3 rounded-(--card-radius-inner) border bg-card-nested p-3 outline-none transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring motion-reduce:transition-none", form.paymentMode === value ? "border-primary" : "border-card-edge hover:border-border")}>
                <input type="radio" name="payment-mode" value={value} checked={form.paymentMode === value} onChange={() => update("paymentMode", value)} className="mt-1 size-4 accent-primary" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{title}</span>
                  <span className="type-caption">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {form.paymentMode === "agreed" ? (
            <p className="type-caption">The quotation PDF will say: “Payment terms: to be agreed upon approval of this quotation.”</p>
          ) : (
          <>
          <p className="type-description">Amounts are calculated from the total and rounded to {form.currency === "UGX" ? "whole shillings" : "the cent"}; the last stage takes any rounding difference.</p>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick splits">
            <span className="type-caption">Quick split:</span>
            {stagePresets.map((preset) => (
              <Button key={preset.label} type="button" size="sm" variant="outline" className="rounded-full tabular-nums"
                onClick={() => update("schedules", preset.stages.map((s) => ({ label: s.label, percent: s.percent, amount: "0", dueAt: "" })))}>
                {preset.label}
              </Button>
            ))}
          </div>
          {/* Laid out by the space the builder has (container query), not the screen: the quotation
              page puts the builder in a narrower column than the New quotation page. Narrow: name,
              then share and amount, then due date. Medium: name, then one row. Wide: one row. */}
          <ol className="@container/stages flex flex-col gap-2" aria-label="Payment stages">
            {form.schedules.map((schedule, index) => {
              const amount = stageAmounts?.[index];
              return (
                <li key={index} className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-end gap-3 rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-3 @md/stages:grid-cols-[6rem_minmax(0,1fr)_10rem_auto] @3xl/stages:grid-cols-[minmax(0,1fr)_6.5rem_10rem_10rem_auto] [&>*]:min-w-0">
                  <div className="col-span-full @3xl/stages:col-span-1">
                    <TextField label={`Stage ${index + 1}`} value={schedule.label} onChange={(v) => setStage(index, { label: v })} placeholder="e.g. Deposit" />
                  </div>
                  <PercentField label="Share" value={schedule.percent} onChange={(v) => setStage(index, { percent: v })} invalid={(percentBasis(schedule.percent) ?? BigInt(0)) <= BigInt(0)} />
                  <div className="col-span-2 flex flex-col gap-2 @md/stages:col-span-1">
                    <span className="type-label">Amount</span>
                    <output className="flex h-(--control-h) items-center rounded-(--control-radius) bg-muted px-3 text-sm font-medium tabular-nums" aria-live="polite">
                      {amount ? formatMoney(form.currency, amount) : "—"}
                    </output>
                  </div>
                  <div className="col-span-2 @md/stages:col-span-1">
                    <TextField label="Due date (optional)" type="date" value={schedule.dueAt.slice(0, 10)} onChange={(v) => setStage(index, { dueAt: v ? new Date(v + "T23:59:59Z").toISOString() : "" })} />
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove stage ${index + 1}`} title="Remove stage" disabled={form.schedules.length === 1} onClick={() => update("schedules", form.schedules.filter((_, i) => i !== index))}>
                    <Trash2Icon />
                  </Button>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={form.schedules.length >= 20} onClick={() => update("schedules", [...form.schedules, { label: `Stage ${form.schedules.length + 1}`, amount: "0", dueAt: "", percent: remaining }])}>
              <PlusIcon /> Add stage
            </Button>
            <p aria-live="polite" className={cn("ml-auto text-sm tabular-nums", stagesProblem ? "text-warning" : total === "—" ? "text-muted-foreground" : "text-success")}>
              {stagesProblem
                ? stagesProblem
                : total === "—"
                  ? "Shares add up to 100%. Amounts appear once the lines are valid."
                  : <><CheckIcon aria-hidden className="mr-1 inline size-4" />100% · {formatMoney(form.currency, total)}</>}
            </p>
          </div>
          </>
          )}
        </Section>

        <Section step={5} id="quote-terms" title="Terms and validity" last>
          <TextField label="Terms" value={form.terms} onChange={(v) => update("terms", v)} multiline required />
          <div className="sm:max-w-xs">
            <TextField
              label="Valid until"
              type="date"
              hint="The quotation expires at the end of this day (UTC)."
              value={form.validUntil.slice(0, 10)}
              onChange={(v) => { if (v) update("validUntil", new Date(v + "T23:59:59Z").toISOString()); }}
              required
            />
          </div>
        </Section>

        <FormMessage>{message}</FormMessage>
        {/* Sticky action bar: the total and the save action stay reachable on long quotations. */}
        <div className="sticky bottom-0 z-10 -mx-(--card-spacing) mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/95 px-(--card-spacing) py-3 backdrop-blur-sm supports-[backdrop-filter]:bg-card/85">
          <div className="flex min-w-0 flex-col">
            <span className="type-caption">{form.items.length} line{form.items.length === 1 ? "" : "s"} · total</span>
            <span className="type-metric-sm">{formatMoney(form.currency, total === "—" ? null : total)}</span>
          </div>
          <div className="flex items-center gap-3">
            {dirty && !pending && <span className="type-caption" role="status">Unsaved changes</span>}
            <Button type="submit" loading={pending}>
              {pending ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </div>
      </form>
      {/* A sheet, not a nested dialog: a full project form is too long for a modal (docs C5). */}
      <Sheet open={projectOpen} onOpenChange={setProjectOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Create planned project</SheetTitle>
            <SheetDescription>
              Your quotation draft stays open behind this panel.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
          <ProjectForm
            clients={data.clients}
            owners={data.owners}
            clientId={form.clientId}
            onCreated={(id) => {
              void getPickers(form.clientId, search).then((r) => {
                setData(r);
                const p = r.projects.find((p) => p.id === id);
                setForm((f) => ({
                  ...f,
                  projectId: id,
                  division: (p?.division ||
                    f.division) as QuoteInput["division"],
                  currency: (p?.currency ||
                    f.currency) as QuoteInput["currency"],
                }));
                setProjectOpen(false);
              });
            }}
          />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** One numbered step of the builder: a heading, an optional one-line explanation, then its fields. */
function Section({ step, id, title, description, last, children }: { step: number; id: string; title: string; description?: string; last?: boolean; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className={cn("flex flex-col gap-4 py-6 first:pt-0", !last && "border-b border-border")}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold tabular-nums text-foreground">{step}</span>
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-title`} className="type-section-title">{title}</h2>
          {description && <p className="type-description">{description}</p>}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}

/** A percentage input with a visible % suffix. Accepts up to two decimals (e.g. 12.5). */
function PercentField({ label, value, onChange, invalid }: { label: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="type-label">{label}</label>
      <div className="relative">
        <Input id={id} inputMode="decimal" value={value} aria-invalid={invalid || undefined} className="pr-8 tabular-nums" onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} />
        <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">%</span>
      </div>
    </div>
  );
}
