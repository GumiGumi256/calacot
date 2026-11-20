"use client";
import { useActionState } from "react";
import { updateProjectTaskStatus } from "@/lib/projects/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
export function ProjectTaskStatus({ projectId, taskId, status, version }: { projectId: string; taskId: string; status: string; version: string }) {
  const [state, action, pending] = useActionState(updateProjectTaskStatus, { ok: false, message: "" });
  return <form action={action} className="flex flex-wrap items-end gap-2 pt-1">
    <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="updatedAt" value={version} />
    <label className="sr-only" htmlFor={`task-status-${taskId}`}>Task status</label>
    <NativeSelect id={`task-status-${taskId}`} name="status" defaultValue={status}>{[["todo","To do"],["in_progress","In progress"],["blocked","Blocked"],["completed","Completed"],["cancelled","Cancelled"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect>
    <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Saving…" : "Update status"}</Button>
    {state.message && <p role="status" className={state.ok ? "w-full text-sm" : "w-full text-sm text-destructive"}>{state.message}</p>}
  </form>;
}
