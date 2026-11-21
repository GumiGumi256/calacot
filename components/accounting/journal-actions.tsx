"use client";
import { useActionState, useState } from "react";
import { journalCommand, reverseJournal } from "@/lib/accounting/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const initial = { ok: false, message: "" };
function Message({ state }: { state: { ok: boolean; message: string } }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p>;
}

type Actions = { submit: boolean; withdraw: boolean; discard: boolean; review: boolean; returnApproved: boolean; post: boolean };

/** Preparer, reviewer and poster controls. The database refuses anything out of turn. */
export function JournalActions({ journalId, version, requestKey, actions, postingReady, postBlockedReason, balanced }: {
  journalId: string; version: number; requestKey: string; actions: Actions; postingReady: boolean; postBlockedReason?: string; balanced: boolean;
}) {
  const [state, action, pending] = useActionState(journalCommand, initial);
  const [confirm, setConfirm] = useState<"discard" | "post" | null>(null);
  const reviewing = actions.review || actions.returnApproved;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="journalId" value={journalId} />
      <input type="hidden" name="version" value={String(version)} />
      <input type="hidden" name="key" value={requestKey} />
      {reviewing && (
        <Field>
          <FieldLabel htmlFor="j-note">Reviewer note</FieldLabel>
          <Textarea id="j-note" name="note" maxLength={2000} aria-describedby="j-note-hint" />
          <FieldDescription id="j-note-hint">Required when returning or rejecting. The preparer sees this note.</FieldDescription>
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        {actions.submit && <Button type="submit" name="command" value="submit" loading={pending} disabled={!balanced}>Submit for approval</Button>}
        {actions.withdraw && <Button type="submit" name="command" value="withdraw" variant="outline" loading={pending}>Withdraw to draft</Button>}
        {actions.review && <Button type="submit" name="command" value="approve" loading={pending}>Approve</Button>}
        {(actions.review || actions.returnApproved) && <Button type="submit" name="command" value="return" variant="outline" disabled={pending}>Return to preparer</Button>}
        {actions.review && <Button type="submit" name="command" value="reject" variant="destructive-ghost" disabled={pending}>Reject</Button>}
        {actions.post && confirm !== "post" && <Button type="button" onClick={() => setConfirm("post")} disabled={!postingReady || pending}>Post to ledger</Button>}
        {actions.post && confirm === "post" && <><Button type="submit" name="command" value="post" loading={pending}>Confirm posting</Button><Button type="button" variant="ghost" onClick={() => setConfirm(null)}>Not yet</Button></>}
        {actions.discard && confirm !== "discard" && <Button type="button" variant="ghost" onClick={() => setConfirm("discard")} disabled={pending}>Discard draft</Button>}
        {actions.discard && confirm === "discard" && <><Button type="submit" name="command" value="discard" variant="destructive" loading={pending}>Confirm discard</Button><Button type="button" variant="ghost" onClick={() => setConfirm(null)}>Keep draft</Button></>}
      </div>
      {actions.submit && !balanced && <p className="text-sm text-muted-foreground">The journal must balance, with at least two lines, before it can be submitted.</p>}
      {actions.post && !postingReady && <p className="text-sm text-muted-foreground">{postBlockedReason ?? "Posting is not enabled yet."}</p>}
      {actions.post && confirm === "post" && <p className="text-sm">Posting is final. The journal gets a number and can afterwards only be corrected by a reversal.</p>}
      {(actions.review) && <p className="text-xs text-muted-foreground">Approval does not post. Someone with posting rights posts approved journals.</p>}
      <Message state={state} />
    </form>
  );
}

/** Reversal: creates a new posted mirror journal. The original is never edited or deleted. */
export function ReverseJournal({ journalId, number, requestKey, today, entryDate }: { journalId: string; number: string; requestKey: string; today: string; entryDate: string }) {
  const [state, action, pending] = useActionState(reverseJournal, initial);
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Reverse journal</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reverse {number}</DialogTitle>
          <DialogDescription>A new journal with every debit and credit swapped is posted on the date you choose. {number} stays in the ledger unchanged, so history is never rewritten.</DialogDescription>
        </DialogHeader>
        {state.ok ? (
          <div className="flex flex-col gap-3"><p role="status" className="text-sm">{state.message}</p><DialogFooter><Button onClick={() => setOpen(false)}>Close</Button></DialogFooter></div>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="journalId" value={journalId} />
            <input type="hidden" name="key" value={requestKey} />
            <Field>
              <FieldLabel htmlFor="rev-date">Reversal date</FieldLabel>
              <Input id="rev-date" name="entryDate" type="date" defaultValue={today} min={entryDate} required aria-describedby="rev-date-hint" />
              <FieldDescription id="rev-date-hint">Must be in an open period and not before {entryDate}. Use today to correct a closed period.</FieldDescription>
            </Field>
            <Field><FieldLabel htmlFor="rev-reason">Reason</FieldLabel><Textarea id="rev-reason" name="reason" required minLength={5} maxLength={300} /></Field>
            <DialogFooter><Button type="submit" variant="destructive" loading={pending}>Post reversal</Button></DialogFooter>
            <Message state={state} />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
