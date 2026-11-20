"use client";
import { useActionState } from "react";
import { updateLead } from "@/lib/admin/actions";
import { label, leadStatuses } from "@/lib/admin/options";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";

export function LeadUpdateForm({ id, status, notes, division, assignee, followUpOn, followUpNotes, staff }: { id: string; status: string; notes: string; division: string; assignee: string; followUpOn: string; followUpNotes: string; staff: {id: string; name: string}[] }) {
  const [state, action, pending] = useActionState(updateLead, { ok: false, message: "" });
  return <form action={action} className="mt-3 flex flex-col gap-2">
    <input type="hidden" name="id" value={id} />
    <label htmlFor={`status-${id}`} className="text-sm font-medium">Status</label>
    <NativeSelect className="capitalize" id={`status-${id}`} name="status" defaultValue={status}>
      {leadStatuses.map(value => <option key={value} value={value}>{label(value)}</option>)}
    </NativeSelect>
    <label htmlFor={`notes-${id}`} className="text-sm font-medium">Internal notes</label>
    <Textarea id={`notes-${id}`} name="adminNotes" defaultValue={notes} maxLength={4000} />
    <label htmlFor={`division-${id}`} className="text-sm font-medium">Department</label>
    <NativeSelect id={`division-${id}`} name="division" defaultValue={division}><option value="">Unspecified</option>{["estates", "architecture", "painting", "interiors", "tech"].map(v => <option key={v} value={v}>{v}</option>)}</NativeSelect>
    <label htmlFor={`assignee-${id}`} className="text-sm font-medium">Assigned employee</label>
    <NativeSelect id={`assignee-${id}`} name="assignedStaffId" defaultValue={assignee}><option value="">Unassigned</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
    <label htmlFor={`followup-${id}`} className="text-sm font-medium">Next follow-up date</label>
    <input id={`followup-${id}`} name="followUpOn" type="date" defaultValue={followUpOn} className="h-9 rounded-md border px-3" />
    <p className="text-xs text-muted-foreground">Clear the date when the follow-up is complete, or enter a new date to reschedule.</p>
    <label htmlFor={`followup-notes-${id}`} className="text-sm font-medium">Next action / follow-up notes</label>
    <Textarea id={`followup-notes-${id}`} name="followUpNotes" defaultValue={followUpNotes} maxLength={4000} />
    <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
    {state.message && <p role="status" className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p>}
  </form>;
}
