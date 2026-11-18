"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { convertLead } from "@/lib/admin/actions";
import { previewClientMatches } from "@/lib/sales/actions";
import { Button } from "@/components/ui/button";

export function LeadConversion({ id, name, email, phone, division, canProject }: { id: string; name: string; email: string; phone: string; division: string; canProject: boolean }) {
  const [pending, start] = useTransition();
  const [matches, setMatches] = useState<{id: string; name: string}[] | null>(null);
  const [selected, setSelected] = useState("");
  const [department, setDepartment] = useState(division);
  const [message, setMessage] = useState("");
  const [client, setClient] = useState("");
  const [confirmDistinct, setConfirmDistinct] = useState(false);
  const payload = {kind:"individual",displayName:name,legalName:"",tradingName:"",department,billingAddress:{line1:"",city:"",country:""},taxIdentifier:"",contacts:[{name,email,phone,isPrimary:true}]};
  return <div className="mt-3 space-y-3">
    {client ? <p role="status">Converted. <Link className="underline" href={`/admin/clients/${client}`}>Open client</Link>{canProject && <> · <Link className="underline" href={`/admin/projects/new?clientId=${client}`}>Create project</Link></>}</p> : <>
      <label className="block text-sm" htmlFor={`client-division-${id}`}>Client department</label>
      <select id={`client-division-${id}`} className="w-full rounded-md border p-2" value={department} onChange={e => { setDepartment(e.target.value); setMatches(null); setConfirmDistinct(false); }}><option value="">Select department</option>{["estates", "architecture", "painting", "interiors", "tech"].map(v => <option key={v} value={v}>{v}</option>)}</select>
      <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => { try { setMatches(await previewClientMatches(payload)); setConfirmDistinct(false); setMessage(""); } catch { setMessage("Check the department and contact details, then try again."); } })}>Check possible clients</Button>
      {matches && <>
        <label className="block text-sm" htmlFor={`client-${id}`}>Link a matching client, or create a new client</label>
        <select id={`client-${id}`} className="w-full rounded-md border p-2" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Create a new client</option>{matches.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        {!selected && matches.length > 0 && <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmDistinct} onChange={e => setConfirmDistinct(e.target.checked)} /> I reviewed the matches and confirm this is a distinct client.</label>}
        <Button type="button" disabled={pending || (!selected && matches.length > 0 && !confirmDistinct)} onClick={() => start(async () => { const r = await convertLead({ leadId: id, clientId: selected, client: payload, reviewedClientIds: matches.map(m => m.id), confirmDistinct }); if (r.ok) setClient(r.id); else { setMatches(null); setConfirmDistinct(false); setMessage(r.error); } })}>{pending ? "Converting…" : "Convert lead"}</Button>
      </>}
      {message && <p role="status" className="text-sm text-destructive">{message}</p>}
    </>}
  </div>;
}
