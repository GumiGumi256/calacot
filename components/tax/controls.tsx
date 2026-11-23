"use client";
import { useActionState, useState } from "react";
import { Message, initial, type State } from "@/components/accounting/admin-forms";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Action = (state: State, data: FormData) => Promise<State>;

/** Approve / reject / cancel / reverse with a note that is required for anything but approval. */
export function DecisionForm({ action, hidden, decisions, label, notePlaceholder = "Note (required to reject, return, cancel or reverse)" }: {
  action: Action; hidden: Record<string, string | number>; decisions: { value: string; label: string; primary?: boolean; name?: string }[]; label: string; notePlaceholder?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [key] = useState(() => crypto.randomUUID());
  if (!decisions.length) return null;
  if (state.ok) return <p role="status" className="text-sm">{state.message}</p>;
  return (
    <form action={formAction} className="flex flex-col gap-2" aria-label={label}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}
      <input type="hidden" name="key" value={key} />
      <Textarea name="note" rows={2} maxLength={2000} placeholder={notePlaceholder} aria-label={`${label}: note`} />
      <div className="flex flex-wrap gap-2">
        {decisions.map((d) => <Button key={d.value} type="submit" name={d.name ?? "decision"} value={d.value} size="sm" variant={d.primary ? "default" : "outline"} loading={pending}>{d.label}</Button>)}
      </div>
      <Message state={state} />
    </form>
  );
}

/** A single keyed command button (import, prepare, capitalize...). */
export function CommandButton({ action, hidden, label, variant = "outline" }: { action: Action; hidden: Record<string, string>; label: string; variant?: "default" | "outline" }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [key] = useState(() => crypto.randomUUID());
  return (
    <form action={formAction} className="flex flex-col gap-1">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="key" value={key} />
      {!state.ok && <Button type="submit" size="sm" variant={variant} loading={pending} className="self-start">{label}</Button>}
      <Message state={state} />
    </form>
  );
}
