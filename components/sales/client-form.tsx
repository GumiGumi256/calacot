"use client";
import { useState, useTransition, useId } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import PhoneInput, { type Value } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { z } from "zod";
import { clientSchema, divisions } from "@/lib/sales/contracts";
import { saveClient, duplicateClients } from "@/lib/sales/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Field, FieldLabel, FieldGroup, FieldSet, FieldLegend } from "@/components/ui/field";
import { TextField, ChoiceField, FormMessage } from "./form-controls";
type ClientInput = z.input<typeof clientSchema>;
const departmentLabels = {estates: "Estates", architecture: "Architecture", painting: "Painting", interiors: "Interiors", tech: "Tech"};

export function ClientForm({ initial }: { initial?: ClientInput }) {
  const router = useRouter();
  const { orgSlug } = useAuth();
  const phoneId = useId();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [duplicates, setDuplicates] = useState<{id: string; name: string}[]>([]);
  const [form, setForm] = useState<ClientInput>(initial || {
    kind: "individual", displayName: "", legalName: "", tradingName: "", taxIdentifier: "",
    billingAddress: {line1: "", city: "", country: ""},
    contacts: [{name: "", email: "", phone: "", isPrimary: true}],
  });
  const update = (key: keyof ClientInput, value: unknown) => setForm(f => ({...f, [key]: value}));
  const updateContact = (index: number, key: "name" | "email" | "phone", value: string) =>
    update("contacts", form.contacts.map((c, i) => i === index ? {...c, [key]: value} : c));
  const clientName = form.kind === "company" ? form.tradingName?.trim() || form.legalName.trim() : form.displayName.trim();
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button variant={initial ? "outline" : "default"} />}>{initial ? "Edit client" : "Create client"}</DialogTrigger>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{initial ? "Edit client" : "Create client"}</DialogTitle>
        <DialogDescription>Choose the client type and department, then add their contact details.</DialogDescription>
      </DialogHeader>
      <form onSubmit={e => {
        e.preventDefault(); setMessage("");
        const payload = {...form, displayName: clientName, contacts: form.contacts.map(c => form.kind === "individual" && c.isPrimary ? {...c, name: clientName} : c)};
        const parsed = clientSchema.safeParse(payload);
        if (!parsed.success) {setMessage(parsed.error.issues[0]?.message || "Check the client details."); return;}
        start(async () => {
          const r = await saveClient(payload);
          if (!r.ok) {setMessage(r.error); return;}
          setOpen(false);
          router.push(`${orgSlug ? "/" + encodeURIComponent(orgSlug) : ""}/admin/clients/${r.value}`);
          router.refresh();
        });
      }}>
        <FieldGroup>
          <ChoiceField label="Client type" value={form.kind} onChange={v => update("kind", v)} options={[{value:"individual",label:"Individual"},{value:"company",label:"Company"}]}/>
          <ChoiceField label="Calacot department" value={form.department || ""} onChange={v => update("department",v)} options={divisions.map(value => ({value, label:departmentLabels[value]}))}/>
          {form.kind === "individual" ? <TextField label="Full name" required value={form.displayName} onChange={v => update("displayName",v)}/> : <>
            <TextField label="Legal company name" required value={form.legalName} onChange={v => update("legalName",v)}/>
            <TextField label="Trading name / doing business as (optional)" value={form.tradingName || ""} onChange={v => update("tradingName",v)}/>
            <TextField label="Tax identifier (optional)" value={form.taxIdentifier} onChange={v => update("taxIdentifier",v)}/>
          </>}
          {form.contacts.map((contact,index) => <FieldSet key={contact.id || index}>
            {(form.kind === "company" || form.contacts.length > 1) && <FieldLegend>{form.kind === "company" ? "Company contact" : "Contact"} {index+1}{contact.isPrimary ? " · Primary" : ""}</FieldLegend>}
            <FieldGroup>
              {(form.kind === "company" || !contact.isPrimary) && <TextField label="Contact person" required value={contact.name} onChange={v => updateContact(index,"name",v)}/>}
              <TextField label="Email" type="email" value={contact.email} onChange={v => updateContact(index,"email",v)}/>
              <Field>
                <FieldLabel htmlFor={`${phoneId}-${index}`}>Phone number</FieldLabel>
                <PhoneInput id={`${phoneId}-${index}`} defaultCountry="UG" international withCountryCallingCode value={contact.phone as Value || undefined} onChange={v => updateContact(index,"phone",v || "")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-within:ring-2 focus-within:ring-ring [&_.PhoneInputInput]:min-w-0 [&_.PhoneInputInput]:bg-transparent [&_.PhoneInputInput]:outline-none [&_.PhoneInputCountrySelect]:bg-background"/>
              </Field>
              {form.contacts.length > 1 && <Button type="button" variant="outline" disabled={contact.isPrimary} onClick={() => update("contacts",form.contacts.map((c,i) => ({...c,isPrimary:i===index})))}>Make primary</Button>}
            </FieldGroup>
          </FieldSet>)}
          {form.kind === "company" && <Button type="button" variant="outline" disabled={form.contacts.length >= 20} onClick={() => update("contacts",[...form.contacts,{name:"",email:"",phone:"",isPrimary:false}])}>Add contact</Button>}
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Billing address (optional)</summary>
            <FieldGroup className="mt-4">
              {([["line1","Address"],["city","City"],["country","Country"]] as const).map(([key,label]) => <TextField key={key} label={label} value={form.billingAddress[key]} onChange={v => update("billingAddress",{...form.billingAddress,[key]:v})}/>)}
            </FieldGroup>
          </details>
          <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => setDuplicates(await duplicateClients(clientName,form.contacts.find(c => c.isPrimary)?.email || "",form.contacts.find(c => c.isPrimary)?.phone || "")))}>Check possible duplicates</Button>
          {duplicates.length > 0 && <p role="status">Possible matches: {duplicates.map(c => c.name).join(", ")}. Review before saving.</p>}
          <FormMessage>{message}</FormMessage>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save client"}</Button>
        </FieldGroup>
      </form>
    </DialogContent>
  </Dialog>;
}
