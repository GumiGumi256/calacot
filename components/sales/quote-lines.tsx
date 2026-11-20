"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import { ArrowDownIcon, ArrowUpIcon, BookOpenIcon, CheckIcon, FileUpIcon, MoreHorizontalIcon, PlusIcon, RotateCcwIcon, SearchIcon, Trash2Icon } from "lucide-react";
import type { quoteSchema } from "@/lib/sales/contracts";
import { totals } from "@/lib/sales/money";
import { searchCatalogue } from "@/lib/catalogue/actions";
import { catalogueTypeLabels, type CatalogueItem } from "@/lib/catalogue/contracts";
import { cleanNumber, parseTable, pick } from "@/lib/sales/csv";
import { formatMoney } from "@/lib/format";
import { CatalogueItemDialog } from "@/components/catalogue/catalogue-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Item = z.input<typeof quoteSchema>["items"][number];
/** Editor-only fields (stripped by the server schema): stable key, catalogue reference price and scope. */
export type QuoteLine = Item & { _key: string; _ref?: string; _scope?: string };
let counter = 0;
export const lineKey = () => `line-${Date.now().toString(36)}-${(counter++).toString(36)}`;
const MAX_LINES = 100;

export function customLine(taxRate: string, patch: Partial<QuoteLine> = {}): QuoteLine {
  return { _key: lineKey(), catalogueItemId: "", name: "", itemType: "", description: "", unit: "item", quantity: "1", unitPrice: "0", discountAmount: "0", taxRate, ...patch };
}
function fromCatalogue(item: CatalogueItem, taxRate: string): QuoteLine {
  return { _key: lineKey(), _ref: item.unit_price, _scope: `${item.division}|${item.currency}`, catalogueItemId: item.id, name: item.name, itemType: item.item_type as QuoteLine["itemType"],
    description: item.description || item.name, unit: item.unit, quantity: "1", unitPrice: item.unit_price, discountAmount: "0", taxRate };
}
/** An untouched starting line is replaced, not kept, when real lines are added. */
const isBlank = (l: QuoteLine) => !l.catalogueItemId && !l.description.trim() && !l.name?.trim() && (l.unitPrice === "0" || l.unitPrice === "");
/** Line total with the same decimal-safe calculation the server uses; display only. */
function lineTotal(line: QuoteLine, taxRate: string) {
  try { return totals([line], taxRate).items[0]; } catch { return null; }
}

const cell = "flex min-w-0 flex-col gap-1";
const cellLabel = "type-label text-muted-foreground @3xl/lines:sr-only";

/*
 * Line items (Design System V1). Lines are compact rows; adding happens at the end of the list,
 * where the user already is, and the new line takes focus. The catalogue opens in a dialog that
 * can add several items without closing; spreadsheets can be pasted or uploaded as lines.
 */
export function QuoteLines({ lines, onChange, division, currency, taxRate, canOverride, canManage, canPick }: {
  lines: QuoteLine[]; onChange: (lines: QuoteLine[]) => void; division: string; currency: string; taxRate: string;
  canOverride: boolean; canManage: boolean; canPick: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  /** Line to focus once it has rendered (a ref, so asking for focus never re-renders). */
  const pendingFocus = useRef<string | null>(null);
  const scope = `${division}|${currency}`;
  const full = lines.length >= MAX_LINES;

  const focusLine = (key: string) => {
    const el = document.getElementById(`${key}-focus`);
    if (!el) return false;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    (el as HTMLInputElement).focus({ preventScroll: true });
    return true;
  };
  const setFocusKey = (key: string) => {
    pendingFocus.current = key;
    // Lines that already exist (e.g. after closing the catalogue) can be focused on the next frame.
    requestAnimationFrame(() => { if (pendingFocus.current === key && focusLine(key)) pendingFocus.current = null; });
  };
  useEffect(() => {
    if (pendingFocus.current && focusLine(pendingFocus.current)) pendingFocus.current = null;
  }, [lines]);

  const set = (i: number, patch: Partial<QuoteLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) => { const next = [...lines]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next); setFocusKey(next[i + d]._key); };
  /** Appends lines (replacing a blank starting line) and focuses the first new one. */
  const append = (added: QuoteLine[], focus = true, replaceBlank = true) => {
    const base = replaceBlank && lines.length === 1 && isBlank(lines[0]) ? [] : lines;
    const next = [...base, ...added].slice(0, MAX_LINES);
    onChange(next);
    if (focus && added[0]) setFocusKey(added[0]._key);
    return next.length - base.length;
  };
  const remove = (i: number) => {
    const next = lines.filter((_, j) => j !== i);
    onChange(next.length ? next : [customLine(taxRate)]);
    const neighbour = next[Math.min(i, next.length - 1)];
    if (neighbour) setFocusKey(neighbour._key);
  };

  const summary = useMemo(() => { try { return totals(lines, taxRate); } catch { return null; } }, [lines, taxRate]);

  return (
    <div className="@container/lines flex flex-col gap-3">
      {/* Column headings when the list is wide (container query: the builder sits in columns of
          different widths); in narrower space each field carries its own label. */}
      <div aria-hidden className="hidden grid-cols-[2rem_minmax(0,1fr)_5.5rem_5.5rem_8rem_7rem_8rem_4.5rem] gap-3 px-3 type-table-head @3xl/lines:grid">
        <span>#</span><span>Item</span><span>Qty</span><span>Unit</span><span>Unit price</span><span>Discount</span><span className="text-right">Total</span><span />
      </div>

      <ol ref={listRef} aria-label="Quotation lines" className="flex flex-col gap-2">
        {lines.map((line, i) => {
          const isCatalogue = !!line.catalogueItemId;
          const overridden = isCatalogue && line._ref !== undefined && line.unitPrice !== line._ref;
          const calc = lineTotal(line, taxRate);
          const mismatch = isCatalogue && line._scope && line._scope !== scope;
          const n = i + 1;
          return (
            <li key={line._key} className={cn("rounded-(--card-radius-inner) border bg-card-nested p-3", mismatch ? "border-destructive-border" : "border-card-edge")}>
              <div className="grid grid-cols-2 gap-3 @3xl/lines:grid-cols-[2rem_minmax(0,1fr)_5.5rem_5.5rem_8rem_7rem_8rem_4.5rem] @3xl/lines:items-start">
                <span className="hidden pt-2 text-sm tabular-nums text-muted-foreground @3xl/lines:block">{n}</span>

                <div className={cn(cell, "col-span-2 @3xl/lines:col-span-1")}>
                  {/* The description box comes first so its top lines up with the number fields; the
                      item's source and type sit underneath it. */}
                  <span className="text-sm tabular-nums text-muted-foreground @3xl/lines:hidden">Line {n}</span>
                  <label htmlFor={isCatalogue ? `${line._key}-desc` : `${line._key}-focus`} className="sr-only">Line {n} description</label>
                  <Textarea
                    id={isCatalogue ? `${line._key}-desc` : `${line._key}-focus`}
                    value={line.description}
                    rows={isCatalogue ? 1 : 2}
                    maxLength={2000}
                    placeholder="Describe the work or item"
                    className="min-h-9 resize-y"
                    onChange={(e) => set(i, { description: e.target.value })}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {isCatalogue ? (overridden ? <Badge variant="destructive">Price override</Badge> : <Badge variant="secondary">Catalogue</Badge>) : <Badge variant="outline">Custom</Badge>}
                    {isCatalogue ? <span className="text-sm font-medium break-words">{line.name}</span> : null}
                    {line.itemType ? <span className="type-caption">{catalogueTypeLabels[line.itemType] ?? line.itemType}</span> : null}
                  </div>
                  {mismatch &&<p role="alert" className="text-sm text-destructive-text">From a different division or currency. Remove it, or change the quotation back.</p>}
                </div>

                <div className={cell}>
                  <label htmlFor={isCatalogue ? `${line._key}-focus` : `${line._key}-qty`} className={cellLabel}>Quantity</label>
                  <Input id={isCatalogue ? `${line._key}-focus` : `${line._key}-qty`} aria-label={`Line ${n} quantity`} inputMode="decimal" value={line.quantity} className="tabular-nums" onChange={(e) => set(i, { quantity: e.target.value.trim() })} />
                </div>
                <div className={cell}>
                  <label htmlFor={`${line._key}-unit`} className={cellLabel}>Unit</label>
                  <Input id={`${line._key}-unit`} aria-label={`Line ${n} unit`} value={line.unit} readOnly={isCatalogue} aria-readonly={isCatalogue} title={isCatalogue ? "Set by the catalogue item" : undefined} maxLength={40} className={isCatalogue ? "bg-muted" : undefined} onChange={(e) => set(i, { unit: e.target.value })} />
                </div>
                <div className={cell}>
                  <label htmlFor={`${line._key}-price`} className={cellLabel}>Unit price ({currency})</label>
                  <Input id={`${line._key}-price`} aria-label={`Line ${n} unit price in ${currency}`} inputMode="decimal" value={line.unitPrice} readOnly={isCatalogue && !canOverride} aria-readonly={isCatalogue && !canOverride}
                    aria-describedby={overridden ? `${line._key}-override` : undefined}
                    title={isCatalogue ? (canOverride ? "Catalogue price; changing it records an override" : "Catalogue price; you can't override it") : undefined}
                    className={cn("tabular-nums", isCatalogue && !canOverride && "bg-muted")} onChange={(e) => set(i, { unitPrice: e.target.value.trim() })} />
                  {overridden && <span id={`${line._key}-override`} className="type-caption">Catalogue {line._ref}</span>}
                </div>
                <div className={cell}>
                  <label htmlFor={`${line._key}-disc`} className={cellLabel}>Discount</label>
                  <Input id={`${line._key}-disc`} aria-label={`Line ${n} discount amount`} inputMode="decimal" value={line.discountAmount} className="tabular-nums" onChange={(e) => set(i, { discountAmount: e.target.value.trim() })} />
                </div>
                <div className={cn(cell, "@3xl/lines:items-end @3xl/lines:pt-2")}>
                  <span className={cellLabel}>Line total</span>
                  {calc ? <span className="font-medium tabular-nums">{formatMoney(currency, calc.total)}</span> : isBlank(line) ? <span className="text-muted-foreground">—</span> : <span className="text-sm text-destructive-text">Check numbers</span>}
                </div>

                <div className="col-span-2 flex items-start justify-end gap-1 @3xl/lines:col-span-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label={`More actions for line ${n}`} />}>
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpIcon /> Move up</DropdownMenuItem>
                      <DropdownMenuItem disabled={i === lines.length - 1} onClick={() => move(i, 1)}><ArrowDownIcon /> Move down</DropdownMenuItem>
                      {overridden && <DropdownMenuItem onClick={() => set(i, { unitPrice: line._ref })}><RotateCcwIcon /> Use catalogue price</DropdownMenuItem>}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => remove(i)}><Trash2Icon /> Remove line</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove line ${n}`} title="Remove line" onClick={() => remove(i)}>
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
              {!isCatalogue && canManage && line.description.trim() && Number(line.unitPrice) > 0 && (
                <div className="mt-2 flex justify-end">
                  <CatalogueItemDialog categories={[]} lockScope source="quotation" trigger={<Button size="xs" variant="ghost" />} triggerLabel={<><BookOpenIcon /> Save to catalogue</>}
                    initial={{ name: line.name || line.description.slice(0, 200), description: line.description, unit: line.unit, unitPrice: line.unitPrice, itemType: line.itemType || "material", division, currency }}
                    onSaved={(item) => set(i, { catalogueItemId: item.id, name: item.name, itemType: item.item_type as QuoteLine["itemType"], unit: item.unit, unitPrice: item.unit_price, _ref: item.unit_price, _scope: `${item.division}|${item.currency}` })} />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Add bar: right under the last line, so adding never means scrolling back up. */}
      <div className="flex flex-wrap items-center gap-2 rounded-(--card-radius-inner) border border-dashed border-border p-2">
        {canPick && (
          <Button type="button" variant="secondary" disabled={full} onClick={() => setPickerOpen(true)}>
            <SearchIcon /> Add from catalogue
          </Button>
        )}
        <Button type="button" variant="outline" disabled={full} onClick={() => append([customLine(taxRate)], true, false)}>
          <PlusIcon /> Add custom line
        </Button>
        <Button type="button" variant="ghost" disabled={full} onClick={() => setImportOpen(true)}>
          <FileUpIcon /> Import lines
        </Button>
        <span className="ml-auto type-caption tabular-nums">{lines.length} of {MAX_LINES} lines</span>
      </div>

      <dl aria-live="polite" className="ml-auto grid w-full max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
        {summary ? (
          <>
            <dt className="text-muted-foreground">Subtotal</dt><dd className="text-right">{formatMoney(currency, summary.subtotal)}</dd>
            {summary.discountAmount !== "0.00" && <><dt className="text-muted-foreground">Discounts</dt><dd className="text-right">−{formatMoney(currency, summary.discountAmount)}</dd></>}
            <dt className="text-muted-foreground">Tax ({taxRate}%)</dt><dd className="text-right">{formatMoney(currency, summary.taxAmount)}</dd>
            <dt className="border-t border-border pt-1 font-medium">Total</dt><dd className="border-t border-border pt-1 text-right font-medium">{formatMoney(currency, summary.total)}</dd>
          </>
        ) : (
          <dd className="col-span-2 text-right text-destructive-text">Totals appear once every line has a description, a quantity above zero and valid amounts.</dd>
        )}
      </dl>

      {canPick && (
        <CataloguePicker open={pickerOpen} onOpenChange={setPickerOpen} division={division} currency={currency} disabled={full}
          onAdd={(item) => append([fromCatalogue(item, taxRate)], false)}
          onDone={(firstKey) => firstKey && setFocusKey(firstKey)} lines={lines} />
      )}
      <ImportLinesDialog open={importOpen} onOpenChange={setImportOpen} taxRate={taxRate} room={MAX_LINES - (lines.length === 1 && isBlank(lines[0]) ? 0 : lines.length)}
        onImport={(added) => append(added)} />
    </div>
  );
}

/** Search the catalogue and add items one after another; the dialog stays open until Done. */
function CataloguePicker({ open, onOpenChange, division, currency, disabled, onAdd, onDone, lines }: {
  open: boolean; onOpenChange: (open: boolean) => void; division: string; currency: string; disabled: boolean;
  onAdd: (item: CatalogueItem) => void; onDone: (firstAddedKey?: string) => void; lines: QuoteLine[];
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogueItem[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Record<string, number>>({});
  const startCount = useRef(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const t = setTimeout(() => {
      setLoading(true);
      searchCatalogue(division, currency, search)
        .then((r) => { if (active) { setResults(r); setStatus(r.length ? "" : search ? "No active items match that search." : `No active ${division} items priced in ${currency} yet.`); } })
        .catch(() => { if (active) setStatus("The catalogue could not be loaded. Try again."); })
        .finally(() => active && setLoading(false));
    }, 200);
    return () => { active = false; clearTimeout(t); };
  }, [division, currency, search, open]);

  const close = () => {
    const count = Object.values(added).reduce((a, b) => a + b, 0);
    onOpenChange(false);
    onDone(count ? lines[startCount.current]?._key : undefined);
    setAdded({});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) { startCount.current = lines.length === 1 && isBlank(lines[0]) ? 0 : lines.length; onOpenChange(true); } else close(); }}>
      <DialogContent className="flex max-h-[min(40rem,85svh)] flex-col gap-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add from catalogue</DialogTitle>
          <DialogDescription>{division[0].toUpperCase() + division.slice(1)} items priced in {currency}. Add as many as you need; each becomes a line you can adjust.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus aria-label="Search the catalogue" placeholder="Search by name, code or category" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <ul aria-label="Catalogue items" aria-busy={loading} className="-mx-2 flex min-h-32 flex-col overflow-y-auto">
          {results.map((item) => {
            const count = added[item.id] ?? 0;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => { onAdd(item); setAdded((a) => ({ ...a, [item.id]: (a[item.id] ?? 0) + 1 })); }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium break-words">{item.name}</span>
                    <span className="type-caption">{[item.category || catalogueTypeLabels[item.item_type], item.code].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="shrink-0 text-right text-sm tabular-nums">{formatMoney(item.currency, item.unit_price)}<span className="block type-caption">per {item.unit}</span></span>
                  <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border", count ? "border-success-border bg-success-soft text-success" : "border-border text-muted-foreground")}>
                    {count ? <CheckIcon className="size-4" /> : <PlusIcon className="size-4" />}
                  </span>
                  <span className="sr-only">{count ? `Added ${count}; add again` : "Add"}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p aria-live="polite" className="type-caption">
          {status || (loading ? "Searching…" : Object.keys(added).length ? `${Object.values(added).reduce((a, b) => a + b, 0)} line(s) added.` : "")}
        </p>
        <DialogFooter>
          <Button type="button" onClick={close}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lines from a spreadsheet: paste cells copied from Excel/Sheets, or upload a CSV. */
function ImportLinesDialog({ open, onOpenChange, taxRate, room, onImport }: {
  open: boolean; onOpenChange: (open: boolean) => void; taxRate: string; room: number; onImport: (lines: QuoteLine[]) => void;
}) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseLines(text, taxRate), [text, taxRate]);
  const usable = parsed.lines.slice(0, Math.max(0, room));
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setText(""); }}>
      <DialogContent className="flex max-h-[min(44rem,90svh)] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import lines</DialogTitle>
          <DialogDescription>
            Paste rows copied from a spreadsheet, or upload a CSV. The first row must name the columns: <span className="font-medium">description</span>, <span className="font-medium">quantity</span>, <span className="font-medium">unit</span>, <span className="font-medium">unit price</span> and, optionally, <span className="font-medium">discount</span>. Imported lines are custom lines.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <label htmlFor="import-lines-text" className="type-label">Rows</label>
          <Textarea id="import-lines-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"description\tquantity\tunit\tunit price\nWall preparation and sanding\t120\tm²\t4500"} className="font-mono text-xs" />
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline">
            <FileUpIcon aria-hidden className="size-4" /> Or choose a CSV file
            <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ""; }} />
          </label>
        </div>
        {text.trim() && (
          <div aria-live="polite" className="flex flex-col gap-2 text-sm">
            <p>
              <span className="font-medium">{parsed.lines.length} line{parsed.lines.length === 1 ? "" : "s"} ready</span>
              {parsed.lines.length > usable.length && <span className="text-warning"> · only {usable.length} fit (100-line limit)</span>}
              {parsed.errors.length > 0 && <span className="text-destructive-text"> · {parsed.errors.length} row{parsed.errors.length === 1 ? "" : "s"} skipped</span>}
            </p>
            {parsed.errors.length > 0 && (
              <ul className="max-h-28 list-disc overflow-y-auto pl-5 type-caption">
                {parsed.errors.slice(0, 20).map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={!usable.length} onClick={() => { onImport(usable); onOpenChange(false); setText(""); }}>
            Add {usable.length || ""} line{usable.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseLines(text: string, taxRate: string) {
  const lines: QuoteLine[] = [];
  const errors: string[] = [];
  if (!text.trim()) return { lines, errors };
  const table = parseTable(text);
  if (!table.headers.some((h) => ["description", "item", "name", "item_description"].includes(h))) {
    return { lines, errors: ["The first row must name the columns, including a description column."] };
  }
  table.rows.forEach((row, i) => {
    const n = i + 2;
    const description = pick(row, "description", "item_description", "item", "name");
    const quantity = cleanNumber(pick(row, "quantity", "qty")) || "1";
    const unitPrice = cleanNumber(pick(row, "unit_price", "price", "rate", "unit_cost", "amount"));
    const discountAmount = cleanNumber(pick(row, "discount", "discount_amount")) || "0";
    const unit = pick(row, "unit", "uom", "units") || "item";
    if (!description) return void errors.push(`Row ${n}: no description.`);
    if (!/^\d{1,10}(\.\d{1,4})?$/.test(quantity) || Number(quantity) <= 0) return void errors.push(`Row ${n}: quantity "${quantity}" isn't a positive number.`);
    if (!/^\d{1,15}(\.\d{1,2})?$/.test(unitPrice)) return void errors.push(`Row ${n}: unit price "${pick(row, "unit_price", "price", "rate", "unit_cost", "amount") || "(empty)"}" isn't a valid amount.`);
    if (!/^\d{1,15}(\.\d{1,2})?$/.test(discountAmount)) return void errors.push(`Row ${n}: discount "${discountAmount}" isn't a valid amount.`);
    lines.push(customLine(taxRate, { description: description.slice(0, 2000), quantity, unitPrice, discountAmount, unit: unit.slice(0, 40) }));
  });
  return { lines, errors };
}
