"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { updateProjectSummary } from "@/lib/projects/summary-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export function ProjectSummaryEdit({ field, projectId, start, due, managerId, staff }: { field: "timeline" | "manager"; projectId: string; start: string; due: string; managerId: string; staff: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: { ok: boolean; message: string }, data: FormData) => {
    const result = await updateProjectSummary(previous, data);
    if (result.ok) { setOpen(false); router.refresh(); }
    return result;
  }, { ok: false, message: "" });
  const title = field === "timeline" ? "Set project timeline" : "Assign project manager";
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button variant="outline" size="sm" className="shrink-0" />}>{field === "timeline" ? "Set" : "Assign"}</DialogTrigger><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{field === "timeline" ? "Set or clear the project start date and deadline." : "Choose an active staff member to manage this project."}</DialogDescription></DialogHeader><form action={action} className="space-y-4"><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="field" value={field} />{field === "timeline" ? <><label className="block space-y-1 text-sm"><span>Start date</span><Input name="start" type="date" defaultValue={start} /></label><label className="block space-y-1 text-sm"><span>Deadline</span><Input name="due" type="date" defaultValue={due} /></label></> : <label className="block space-y-1 text-sm"><span>Project manager</span><NativeSelect name="managerId" defaultValue={managerId} wrapperClassName="w-full"><option value="">Unassigned</option>{managerId && !staff.some(s => s.id === managerId) && <option value={managerId}>Current manager unavailable — choose another</option>}{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></label>}{!state.ok && state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}<Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button></form></DialogContent></Dialog>;
}
