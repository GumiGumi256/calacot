"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addProjectMember, removeProjectMember } from "@/lib/projects/team-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

const initial = { ok: false, message: "" };
type Staff = { id: string; name: string };

function AddForm({ projectId, staff, onDone }: { projectId: string; staff: Staff[]; onDone: () => void }) {
  const [kind, setKind] = useState("staff");
  const [state, action, pending] = useActionState(addProjectMember, initial);
  const router = useRouter();
  useEffect(() => { if (state.ok) { router.refresh(); onDone(); } }, [state, router, onDone]);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="projectId" value={projectId} />
    <label className="block space-y-1"><span>Member type</span><NativeSelect name="kind" value={kind} onChange={e => setKind(e.target.value)}><option value="staff">Calacot staff</option><option value="external">External member or subcontractor</option></NativeSelect></label>
    {kind === "staff" ? <label className="block space-y-1"><span>Staff member</span><NativeSelect name="staffId" required defaultValue=""><option value="" disabled>Select a staff member</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></label> : <>
      <label className="block space-y-1"><span>Full name</span><Input name="name" required maxLength={200} /></label>
      <label className="block space-y-1"><span>Company (optional)</span><Input name="company" maxLength={200} /></label>
      <label className="block space-y-1"><span>Phone (optional)</span><Input name="phone" type="tel" maxLength={50} /></label>
      <label className="block space-y-1"><span>Email (optional)</span><Input name="email" type="email" maxLength={254} /></label>
    </>}
    <label className="block space-y-1"><span>Responsibility (optional)</span><Input name="responsibility" maxLength={200} placeholder="e.g. Site supervisor" /></label>
    <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add member"}</Button>
    {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
  </form>;
}

export function AddProjectMember({ projectId, staff }: { projectId: string; staff: Staff[] }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button size="sm" />}>Add team member</DialogTrigger><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Add team member</DialogTitle><DialogDescription>Record staff or an external person. Adding someone does not grant them access to Calacot.</DialogDescription></DialogHeader>{open && <AddForm projectId={projectId} staff={staff} onDone={() => setOpen(false)} />}</DialogContent></Dialog>;
}

export function RemoveProjectMember({ projectId, memberId, name }: { projectId: string; memberId: string; name: string }) {
  const [state, action, pending] = useActionState(removeProjectMember, initial);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  useEffect(() => { if (state.ok) router.refresh(); }, [state, router]);
  return <form action={action} className="flex flex-wrap items-center gap-2"><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="memberId" value={memberId} />{confirming ? <><Button type="submit" size="sm" variant="destructive" disabled={pending}>Confirm removal</Button><Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button></> : <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={`Remove ${name} from project`}>Remove</Button>}{state.message && !state.ok && <span role="alert" className="text-sm text-destructive">{state.message}</span>}</form>;
}
