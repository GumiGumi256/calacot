"use client";
import { useEffect, useId, useState } from "react";
import type { z } from "zod";
import type { quoteSchema } from "@/lib/sales/contracts";
import { totals } from "@/lib/sales/money";
import { searchCatalogue } from "@/lib/catalogue/actions";
import { catalogueItemTypes, catalogueTypeLabels, type CatalogueItem } from "@/lib/catalogue/contracts";
import { CatalogueItemDialog } from "@/components/catalogue/catalogue-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";

type Item = z.input<typeof quoteSchema>["items"][number];
/** Editor-only fields (stripped by the server schema): stable key, catalogue reference price and scope. */
export type QuoteLine = Item & { _key: string; _ref?: string; _scope?: string };
let counter = 0;
export const lineKey = () => `line-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function customLine(taxRate: string): QuoteLine {
  return { _key: lineKey(), catalogueItemId: "", name: "", itemType: "", description: "", unit: "item", quantity: "1", unitPrice: "0", discountAmount: "0", taxRate };
}
function fromCatalogue(item: CatalogueItem, taxRate: string): QuoteLine {
  return { _key: lineKey(), _ref: item.unit_price, _scope: `${item.division}|${item.currency}`, catalogueItemId: item.id, name: item.name, itemType: item.item_type as QuoteLine["itemType"],
    description: item.description || item.name, unit: item.unit, quantity: "1", unitPrice: item.unit_price, discountAmount: "0", taxRate };
}
/** Line total with the same decimal-safe calculation the server uses; display only. */
function lineTotal(line: QuoteLine, taxRate: string) {
  try { return totals([line], taxRate).items[0]; } catch { return null; }
}

function Text({ label, value, onChange, readOnly, hint, inputMode, multiline }: { label: string; value: string; onChange?: (v: string) => void; readOnly?: boolean; hint?: string; inputMode?: "decimal"; multiline?: boolean }) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline
        ? <Textarea id={id} value={value} rows={2} maxLength={2000} onChange={(e) => onChange?.(e.target.value)} />
        : <Input id={id} value={value} readOnly={readOnly} aria-readonly={readOnly} inputMode={inputMode} maxLength={200} className={readOnly ? "bg-muted" : undefined} onChange={(e) => onChange?.(e.target.value)} />}
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

export function QuoteLines({ lines, onChange, division, currency, taxRate, canOverride, canManage, canPick }: {
  lines: QuoteLine[]; onChange: (lines: QuoteLine[]) => void; division: string; currency: string; taxRate: string;
  canOverride: boolean; canManage: boolean; canPick: boolean;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogueItem[]>([]);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!canPick) return;
    let active = true;
    const t = setTimeout(() => {
      searchCatalogue(division, currency, search)
        .then((r) => { if (active) { setResults(r); setStatus(r.length ? "" : search ? "No active items match." : `No active ${division} items priced in ${currency} yet.`); } })
        .catch(() => { if (active) setStatus("Could not load the catalogue."); });
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [division, currency, search, canPick]);

  const set = (i: number, patch: Partial<QuoteLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) => { const next = [...lines]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next); };
  const scope = `${division}|${currency}`;

  return (
    <div className="flex flex-col gap-4">
      {canPick && (
        <FieldSet className="rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-4">
          <FieldLegend>Add from catalogue</FieldLegend>
          <Text label={`Search ${division} items (${currency})`} value={search} onChange={setSearch} />
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto" aria-label="Catalogue results">
            {results.map((item) => (
              <li key={item.id}>
                <button type="button" disabled={lines.length >= 100} onClick={() => onChange([...lines, fromCatalogue(item, taxRate)])}
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-4 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50">
                  <span className="min-w-0 break-words"><span className="font-medium">{item.name}</span> <span className="text-muted-foreground">· {item.category || catalogueTypeLabels[item.item_type]}</span></span>
                  <span className="tabular-nums text-muted-foreground">{item.currency} {item.unit_price} / {item.unit}</span>
                </button>
              </li>
            ))}
          </ul>
          {status && <p className="text-sm text-muted-foreground" aria-live="polite">{status}</p>}
        </FieldSet>
      )}

      {lines.map((line, i) => {
        const isCatalogue = !!line.catalogueItemId;
        const overridden = isCatalogue && line._ref !== undefined && line.unitPrice !== line._ref;
        const calc = lineTotal(line, taxRate);
        const mismatch = isCatalogue && line._scope && line._scope !== scope;
        return (
          <FieldSet key={line._key} className="rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-4">
            <FieldLegend className="flex w-full flex-wrap items-center gap-2">
              <span>Line {i + 1}</span>
              {isCatalogue ? (overridden ? <Badge variant="destructive">Price override</Badge> : <Badge>Catalogue price</Badge>) : <Badge variant="outline">Custom line</Badge>}
              {line.name && <span className="min-w-0 break-words font-normal text-muted-foreground">{line.name}</span>}
            </FieldLegend>
            {mismatch && <p role="alert" className="text-sm text-destructive">This catalogue item belongs to a different division or currency. Remove it or change the quotation back.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {isCatalogue ? (
                <Text label="Item" value={line.name ?? ""} readOnly />
              ) : (
                <>
                  <Text label="Item name (optional)" value={line.name ?? ""} onChange={(v) => set(i, { name: v })} />
                  <Field>
                    <FieldLabel htmlFor={`${line._key}-type`}>Type (optional)</FieldLabel>
                    <NativeSelect wrapperClassName="w-full" id={`${line._key}-type`} value={line.itemType ?? ""} onChange={(e) => set(i, { itemType: e.target.value as QuoteLine["itemType"] })}>
                      <option value="">Not specified</option>
                      {catalogueItemTypes.map((t) => <option key={t} value={t}>{catalogueTypeLabels[t]}</option>)}
                    </NativeSelect>
                  </Field>
                </>
              )}
              <div className="sm:col-span-2"><Text label="Description" multiline value={line.description} onChange={(v) => set(i, { description: v })} /></div>
              <Text label="Unit" value={line.unit} readOnly={isCatalogue} hint={isCatalogue ? "Set by the catalogue item." : undefined} onChange={(v) => set(i, { unit: v })} />
              <Text label="Quantity" inputMode="decimal" value={line.quantity} onChange={(v) => set(i, { quantity: v.trim() })} />
              <Text label={`Unit price (${currency})`} inputMode="decimal" value={line.unitPrice} readOnly={isCatalogue && !canOverride}
                hint={isCatalogue ? (overridden ? `Catalogue price ${line._ref}. This override is recorded.` : canOverride ? "Catalogue price. Changing it records an override." : "Catalogue price. You are not permitted to override it.") : undefined}
                onChange={(v) => set(i, { unitPrice: v.trim() })} />
              <Text label="Discount amount" inputMode="decimal" value={line.discountAmount} onChange={(v) => set(i, { discountAmount: v.trim() })} />
            </div>
            <p className="text-sm tabular-nums" aria-live="polite">
              {calc ? <>Line subtotal {currency} {calc.subtotal} · tax {calc.taxAmount} ({taxRate}%) · <span className="font-medium">line total {currency} {calc.total}</span></> : <span className="text-destructive">Check quantity (up to 4 decimals), price and discount (up to 2 decimals).</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move line ${i + 1} up`}>Move up</Button>
              <Button type="button" size="sm" variant="outline" disabled={i === lines.length - 1} onClick={() => move(i, 1)} aria-label={`Move line ${i + 1} down`}>Move down</Button>
              <Button type="button" size="sm" variant="outline" disabled={lines.length === 1} onClick={() => onChange(lines.filter((_, j) => j !== i))}>Remove line</Button>
              {overridden && <Button type="button" size="sm" variant="ghost" onClick={() => set(i, { unitPrice: line._ref })}>Use catalogue price</Button>}
              {!isCatalogue && canManage && (
                <CatalogueItemDialog categories={[]} lockScope source="quotation" trigger={<Button size="sm" variant="secondary" />} triggerLabel="Save to catalogue"
                  initial={{ name: line.name || line.description.slice(0, 200), description: line.description, unit: line.unit, unitPrice: line.unitPrice, itemType: line.itemType || "material", division, currency }}
                  onSaved={(item) => set(i, { catalogueItemId: item.id, name: item.name, itemType: item.item_type as QuoteLine["itemType"], unit: item.unit, unitPrice: item.unit_price, _ref: item.unit_price, _scope: `${item.division}|${item.currency}` })} />
              )}
            </div>
          </FieldSet>
        );
      })}
      <div>
        <Button type="button" variant="outline" disabled={lines.length >= 100} onClick={() => onChange([...lines, customLine(taxRate)])}>Add custom line</Button>
      </div>
    </div>
  );
}
