"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import { quoteSchema, divisions, currencies } from "@/lib/sales/contracts";
import { saveQuote, getPickers } from "@/lib/sales/actions";
import { totals } from "@/lib/sales/money";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSet, FieldLegend } from "@/components/ui/field";
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
type QuoteInput = Omit<z.input<typeof quoteSchema>, "items"> & { items: QuoteLine[] };
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
        schedules: [{ label: "Full amount", amount: "0", dueAt: "" }],
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
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveQuote(form);
            if (r.ok) {
              setBaseline(snapshot(form));
              notify.success(initial ? "Draft saved" : "Quotation draft created");
              router.push(`/admin/quotations/${r.value}`);
              router.refresh();
            } else setMessage(r.error);
          });
        }}
      >
        <FieldGroup>
          <TextField
            label="Search clients"
            value={search}
            onChange={setSearch}
          />
          <ChoiceField
            label="Client"
            value={form.clientId}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                clientId: v,
                projectId: "",
                contactId: "",
              }))
            }
            options={data.clients.map((c) => ({
              value: String(c.id),
              label: String(c.name),
            }))}
          />
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
            options={data.projects.map((p) => ({
              value: String(p.id),
              label: String(p.name),
            }))}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!form.clientId}
            onClick={() => setProjectOpen(true)}
          >
            Create project for this client
          </Button>
          <ChoiceField
            label="Delivery contact"
            value={form.contactId}
            onChange={(v) => update("contactId", v)}
            options={data.contacts.map((c) => ({
              value: String(c.id),
              label: `${c.name} · ${c.email}`,
            }))}
          />
          <TextField
            label="Quotation title"
            value={form.title}
            onChange={(v) => update("title", v)}
            required
          />
          <ChoiceField
            label="Division"
            value={form.division}
            onChange={(v) => update("division", v)}
            options={divisions.map((value) => ({ value, label: value }))}
          />
          <ChoiceField
            label="Currency"
            value={form.currency}
            onChange={(v) => update("currency", v)}
            options={currencies.map((value) => ({ value, label: value }))}
          />
          <TextField
            label="Scope"
            value={form.scope}
            onChange={(v) => update("scope", v)}
            multiline
            required
          />
          <TextField
            label="Deliverables (one per line)"
            value={form.deliverables.join("\n")}
            onChange={(v) => update("deliverables", v.split("\n"))}
            multiline
          />
          <TextField
            label="Exclusions (one per line)"
            value={form.exclusions.join("\n")}
            onChange={(v) => update("exclusions", v.split("\n"))}
            multiline
          />
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
          <p className="text-sm text-muted-foreground">Approved tax: {taxRate}% on every line.</p>
          <p aria-live="polite">
            Calculated total: {form.currency} {total}. The server independently
            recomputes the total.
          </p>
          {form.schedules.map((schedule, index) => (
            <FieldSet key={index}>
              <FieldLegend>Payment stage {index + 1}</FieldLegend>
              <FieldGroup>
                {(
                  [
                    ["label", "Label"],
                    ["amount", "Amount"],
                  ] as const
                ).map(([k, label]) => (
                  <TextField
                    key={k}
                    label={label}
                    value={schedule[k]}
                    onChange={(v) =>
                      update(
                        "schedules",
                        form.schedules.map((s, i) =>
                          i === index ? { ...s, [k]: v } : s,
                        ),
                      )
                    }
                  />
                ))}
                <TextField
                  label="Optional due date"
                  type="date"
                  value={schedule.dueAt.slice(0, 10)}
                  onChange={(v) =>
                    update(
                      "schedules",
                      form.schedules.map((s, i) =>
                        i === index
                          ? {
                              ...s,
                              dueAt: v
                                ? new Date(v + "T23:59:59Z").toISOString()
                                : "",
                            }
                          : s,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={form.schedules.length === 1}
                  onClick={() =>
                    update(
                      "schedules",
                      form.schedules.filter((_, i) => i !== index),
                    )
                  }
                >
                  Remove stage
                </Button>
              </FieldGroup>
            </FieldSet>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              update("schedules", [
                ...form.schedules,
                { label: "", amount: "0", dueAt: "" },
              ])
            }
          >
            Add payment stage
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={total === "—"}
            onClick={() =>
              update("schedules", [
                { label: "Full agreed amount", amount: total, dueAt: "" },
              ])
            }
          >
            Use full-total schedule
          </Button>
          <TextField
            label="Terms"
            value={form.terms}
            onChange={(v) => update("terms", v)}
            multiline
            required
          />
          <TextField
            label="Valid until (UTC date)"
            type="date"
            value={form.validUntil.slice(0, 10)}
            onChange={(v) => {
              if (v)
                update("validUntil", new Date(v + "T23:59:59Z").toISOString());
            }}
            required
          />
          <FormMessage>{message}</FormMessage>
          {/* Sticky action bar: the total and the save action stay reachable on long quotations. */}
          <div className="sticky bottom-0 z-10 -mx-(--card-spacing) flex flex-wrap items-center justify-between gap-3 border-t bg-card/95 px-(--card-spacing) py-3 backdrop-blur-sm supports-[backdrop-filter]:bg-card/85">
            <div className="flex min-w-0 flex-col">
              <span className="type-caption">Calculated total</span>
              <span className="type-metric-sm">{formatMoney(form.currency, total === "—" ? null : total)}</span>
            </div>
            <div className="flex items-center gap-3">
              {dirty && !pending && <span className="type-caption" role="status">Unsaved changes</span>}
              <Button type="submit" loading={pending}>
                {pending ? "Saving…" : "Save draft"}
              </Button>
            </div>
          </div>
        </FieldGroup>
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
