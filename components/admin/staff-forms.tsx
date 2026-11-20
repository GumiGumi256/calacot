"use client";
import { UserPlusIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { changeStaffRole, inviteStaff, removeStaffMember, revokeInvitation, saveStaffProfile, setEmployeeEligibility, setStaffStatus } from "@/lib/admin/staff-actions";
import { divisionsList, staffRoles } from "@/lib/admin/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";

const initial = { ok: false, message: "" };
function Message({ state }: { state: { ok: boolean; message: string } }) {
  return state.message ? <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p> : null;
}
function RoleOptions({ available, actorIsAdmin }: { available: string[]; actorIsAdmin: boolean }) {
  return <>{staffRoles.map((r) => {
    const missing = !available.includes(r.key);
    const blocked = r.key === "org:admin" && !actorIsAdmin;
    return <option key={r.key} value={r.key} disabled={missing || blocked}>{r.label}{missing ? " (not configured in Clerk)" : blocked ? " (administrators only)" : ""}</option>;
  })}</>;
}

export function InviteStaff({ available, actorIsAdmin }: { available: string[]; actorIsAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(inviteStaff, initial);
  const [role, setRole] = useState("org:member");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}><UserPlusIcon /> Invite staff</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite an employee</DialogTitle>
          <DialogDescription>Clerk emails an invitation. The person signs in with their own Clerk account; no local password is created.</DialogDescription>
        </DialogHeader>
        {state.ok ? <div className="flex flex-col gap-3"><Message state={state} /><DialogFooter><Button onClick={() => setOpen(false)}>Close</Button></DialogFooter></div> : (
          <form action={action} className="flex flex-col gap-4">
            <FieldGroup>
              <Field><FieldLabel htmlFor="invite-email">Work email</FieldLabel><Input id="invite-email" name="email" type="email" required maxLength={254} autoComplete="off" /></Field>
              <Field>
                <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                <NativeSelect wrapperClassName="w-full" id="invite-role" name="role" value={role} onChange={(e) => setRole(e.target.value)} aria-describedby="invite-role-hint"><RoleOptions available={available} actorIsAdmin={actorIsAdmin} /></NativeSelect>
                <FieldDescription id="invite-role-hint">{staffRoles.find((r) => r.key === role)?.summary} Start with the least access needed.{role === "org:member" ? " Staff/employee members get no access until you approve them on their staff page after they join." : ""}</FieldDescription>
              </Field>
              <Field><FieldLabel htmlFor="invite-division">Division (optional)</FieldLabel><NativeSelect wrapperClassName="w-full" className="capitalize" id="invite-division" name="division" defaultValue=""><option value="">Not assigned</option>{divisionsList.map((d) => <option key={d} value={d}>{d}</option>)}</NativeSelect></Field>
            </FieldGroup>
            <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Sending..." : "Send invitation"}</Button></DialogFooter>
            <Message state={state} />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RevokeInvitation({ invitationId }: { invitationId: string }) {
  const [state, action, pending] = useActionState(revokeInvitation, initial);
  const [confirm, setConfirm] = useState(false);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="invitationId" value={invitationId} />
      {confirm ? <><Button type="submit" size="sm" variant="destructive" disabled={pending}>Confirm revoke</Button><Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(false)}>Keep</Button></> : <Button type="button" size="sm" variant="outline" onClick={() => setConfirm(true)}>Revoke</Button>}
      <Message state={state} />
    </form>
  );
}

export function StaffProfileForm({ staffId, version, division, jobTitle, responsibilities }: { staffId: string; version: number; division: string; jobTitle: string; responsibilities: string }) {
  const [state, action, pending] = useActionState(saveStaffProfile, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="staffId" value={staffId} /><input type="hidden" name="version" value={String(version)} />
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="profile-division">Division</FieldLabel><NativeSelect wrapperClassName="w-full" className="capitalize" id="profile-division" name="division" defaultValue={division}><option value="">Not assigned</option>{divisionsList.map((d) => <option key={d} value={d}>{d}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="profile-title">Job title</FieldLabel><Input id="profile-title" name="jobTitle" defaultValue={jobTitle} maxLength={120} /></Field>
        </div>
        <Field><FieldLabel htmlFor="profile-resp">Responsibilities</FieldLabel><Textarea id="profile-resp" name="responsibilities" defaultValue={responsibilities} maxLength={2000} aria-describedby="profile-resp-hint" /><FieldDescription id="profile-resp-hint">For coordination only. Responsibilities never grant system access; the role does.</FieldDescription></Field>
      </FieldGroup>
      <div><Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save profile"}</Button></div>
      <Message state={state} />
    </form>
  );
}

export function ChangeRole({ userId, current, available, actorIsAdmin }: { userId: string; current: string; available: string[]; actorIsAdmin: boolean }) {
  const [state, action, pending] = useActionState(changeStaffRole, initial);
  const [role, setRole] = useState(current);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="userId" value={userId} />
      <Field>
        <FieldLabel htmlFor="role-select">Role</FieldLabel>
        <NativeSelect wrapperClassName="w-full" id="role-select" name="role" value={role} onChange={(e) => setRole(e.target.value)} aria-describedby="role-hint"><RoleOptions available={available} actorIsAdmin={actorIsAdmin} /></NativeSelect>
        <FieldDescription id="role-hint">{staffRoles.find((r) => r.key === role)?.summary}</FieldDescription>
      </Field>
      <Field><FieldLabel htmlFor="role-reason">Reason for the change</FieldLabel><Input id="role-reason" name="reason" required minLength={5} maxLength={1000} /></Field>
      <div><Button type="submit" variant="outline" disabled={pending || role === current}>{pending ? "Updating..." : "Change role"}</Button></div>
      <Message state={state} />
    </form>
  );
}

export function StaffStatusControl({ staffId, version, status }: { staffId: string; version: number; status: string }) {
  const [state, action, pending] = useActionState(setStaffStatus, initial);
  const target = status === "suspended" ? "active" : "suspended";
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="staffId" value={staffId} /><input type="hidden" name="version" value={String(version)} /><input type="hidden" name="status" value={target} />
      <Field><FieldLabel htmlFor="status-reason">{target === "suspended" ? "Reason for suspending access" : "Reason for lifting the suspension"}</FieldLabel><Input id="status-reason" name="reason" required minLength={5} maxLength={1000} /></Field>
      <div><Button type="submit" variant={target === "suspended" ? "destructive" : "outline"} disabled={pending}>{target === "suspended" ? "Suspend access" : "Lift suspension"}</Button></div>
      <Message state={state} />
    </form>
  );
}

export function RemoveMember({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(removeStaffMember, initial);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" className="text-destructive" />}>Remove from organization</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Remove {name}?</DialogTitle><DialogDescription>Their Clerk organization membership is deleted and they lose access immediately. Their history, assignments and audit records are kept. To return, they must be invited again.</DialogDescription></DialogHeader>
        {state.ok ? <div className="flex flex-col gap-3"><Message state={state} /><DialogFooter><Button onClick={() => setOpen(false)}>Close</Button></DialogFooter></div> : (
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="userId" value={userId} />
            <Field><FieldLabel htmlFor="remove-reason">Reason</FieldLabel><Input id="remove-reason" name="reason" required minLength={5} maxLength={1000} /></Field>
            <DialogFooter><Button type="submit" variant="destructive" disabled={pending}>{pending ? "Removing..." : "Remove member"}</Button></DialogFooter>
            <Message state={state} />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function EmployeeEligibility({ staffId, version, eligibility }: { staffId: string; version: number; eligibility: string }) {
  const [state, action, pending] = useActionState(setEmployeeEligibility, initial);
  const target = eligibility === "approved" ? "revoked" : "approved";
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="staffId" value={staffId} /><input type="hidden" name="version" value={String(version)} /><input type="hidden" name="eligibility" value={target} />
      <p className="text-sm">{eligibility === "approved" ? "Approved employee: can use Staff/Employee capabilities (own expense requests)." : "Not approved: this Clerk member has no access to the admin system until an administrator approves them as an employee."}</p>
      <Field><FieldLabel htmlFor="eligibility-reason">{target === "approved" ? "How was employment verified?" : "Reason for revoking approval"}</FieldLabel><Input id="eligibility-reason" name="reason" required minLength={5} maxLength={1000} /></Field>
      <div><Button type="submit" variant={target === "approved" ? "default" : "outline"} disabled={pending}>{target === "approved" ? "Approve as employee" : "Revoke employee approval"}</Button></div>
      <Message state={state} />
    </form>
  );
}
