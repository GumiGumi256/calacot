"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCatalogueItem } from "@/lib/catalogue/actions";
import { catalogueItemTypes, catalogueTypeLabels, suggestedUnits, type CatalogueItem } from "@/lib/catalogue/contracts";
import { divisions, currencies } from "@/lib/sales/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type CatalogueDraft = { name: string; division: string; category: string; itemType: string; description: string; unit: string; unitPrice: string; currency: string };
const blank: CatalogueDraft = { name: "", division: "painting", category: "", itemType: "material", description: "", unit: "m²", unitPrice: "", currency: "UGX" };

/** Fields shared by the catalogue page and the quotation editor's save-to-catalogue dialog. */
function ItemFields({ value, onChange, categories, lockScope }: { value: CatalogueDraft; onChange: (v: CatalogueDraft) => void; categories: string[]; lockScope?: boolean }) {
  const set = (k: keyof CatalogueDraft) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
      <Field className="sm:col-span-2"><FieldLabel htmlFor="cat-name">Item name</FieldLabel><Input id="cat-name" required maxLength={200} value={value.name} onChange={set("name")} /></Field>
      <Field><FieldLabel htmlFor="cat-division">Division</FieldLabel>
        <NativeSelect wrapperClassName="w-full" id="cat-division" value={value.division} onChange={set("division")} disabled={lockScope}>{divisions.map((d) => <option key={d} value={d}>{label(d)}</option>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor="cat-type">Type</FieldLabel>
        <NativeSelect wrapperClassName="w-full" id="cat-type" value={value.itemType} onChange={set("itemType")}>{catalogueItemTypes.map((t) => <option key={t} value={t}>{catalogueTypeLabels[t]}</option>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor="cat-category">Category</FieldLabel><Input id="cat-category" list="cat-categories" maxLength={80} placeholder="e.g. Interior paint" value={value.category} onChange={set("category")} />
        <datalist id="cat-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist></Field>
      <Field><FieldLabel htmlFor="cat-unit">Unit of measurement</FieldLabel><Input id="cat-unit" list="cat-units" required maxLength={40} value={value.unit} onChange={set("unit")} />
        <datalist id="cat-units">{suggestedUnits.map((u) => <option key={u} value={u} />)}</datalist></Field>
      <Field><FieldLabel htmlFor="cat-price">Default selling price per unit</FieldLabel><Input id="cat-price" required inputMode="decimal" pattern="\d{1,15}(\.\d{1,2})?" value={value.unitPrice} onChange={set("unitPrice")} />
        <FieldDescription>A default for new quotation lines. Issued quotations never change.</FieldDescription></Field>
      <Field><FieldLabel htmlFor="cat-currency">Currency</FieldLabel>
        <NativeSelect wrapperClassName="w-full" id="cat-currency" value={value.currency} onChange={set("currency")} disabled={lockScope}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect></Field>
      <Field className="sm:col-span-2"><FieldLabel htmlFor="cat-description">Description</FieldLabel><Textarea id="cat-description" maxLength={2000} rows={3} value={value.description} onChange={set("description")} /></Field>
    </FieldGroup>
  );
}

/** Create (no item) or edit an item; also used from the quotation editor with a prefilled draft. */
export function CatalogueItemDialog({ item, initial, categories, trigger, triggerLabel, lockScope, source = "catalogue", onSaved }: {
  item?: CatalogueItem; initial?: Partial<CatalogueDraft>; categories: string[]; trigger: React.ReactElement; triggerLabel: React.ReactNode; lockScope?: boolean;
  source?: "catalogue" | "quotation"; onSaved?: (item: CatalogueItem) => void;
}) {
  const router = useRouter();
  const start = (): CatalogueDraft => item
    ? { name: item.name, division: item.division, category: item.category ?? "", itemType: item.item_type, description: item.description ?? "", unit: item.unit, unitPrice: item.unit_price, currency: item.currency }
    : { ...blank, ...initial };
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<CatalogueDraft>(start);
  const [message, setMessage] = useState("");
  const [pending, run] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setValue(start()); setMessage(""); } }}>
      <DialogTrigger render={trigger}>{triggerLabel}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={(e) => {
          e.preventDefault(); e.stopPropagation();
          run(async () => {
            const r = await saveCatalogueItem({ ...value, id: item?.id, rowVersion: item?.row_version, isActive: item ? item.is_active : true, source });
            if (!r.ok) { setMessage(r.message); return; }
            setOpen(false);
            if (r.item) onSaved?.(r.item);
            router.refresh();
          });
        }}>
          <DialogHeader className="mb-4">
            <DialogTitle>{item ? "Edit catalogue item" : "New catalogue item"}</DialogTitle>
            <DialogDescription>{item ? `${item.code} · price changes apply to new quotation lines only.` : "Staff can select this item when building quotations."}</DialogDescription>
          </DialogHeader>
          <ItemFields value={value} onChange={setValue} categories={categories} lockScope={lockScope} />
          {message && <p role="alert" className="mt-4 text-sm text-destructive">{message}</p>}
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : item ? "Save changes" : "Create item"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Deactivate or reactivate. Deactivated items cannot be newly selected; history is untouched. */
export function CatalogueStatusButton({ item }: { item: CatalogueItem }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" size="sm" variant={item.is_active ? "outline" : "secondary"} disabled={pending} onClick={() => run(async () => {
        const r = await saveCatalogueItem({ id: item.id, rowVersion: item.row_version, name: item.name, division: item.division, category: item.category ?? "", itemType: item.item_type, description: item.description ?? "", unit: item.unit, unitPrice: item.unit_price, currency: item.currency, isActive: !item.is_active });
        if (!r.ok) setMessage(r.message); else router.refresh();
      })}>{pending ? "…" : item.is_active ? "Deactivate" : "Reactivate"}</Button>
      {message && <span role="alert" className="max-w-56 text-xs text-destructive">{message}</span>}
    </span>
  );
}
