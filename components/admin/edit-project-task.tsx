"use client";
import { useActionState } from "react";
import { editProjectTask } from "@/lib/projects/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
export function EditProjectTask({ projectId, taskId, title, priority, assigneeId, dueDate, version, staff, mandatory }: { projectId: string; taskId: string; title: string; priority: string; assigneeId: string; dueDate: string; version: string; mandatory: boolean; staff: {id: string; name: string}[] }) {
  const [state, action, pending] = useActionState(editProjectTask, { ok: false, message: "" });
  return <details className="rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-2 text-sm"><summary className="cursor-pointer font-medium">Edit task</summary><form action={action} className="mt-2 flex flex-col gap-2">
    <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="updatedAt" value={version} />
    <label htmlFor={`edit-title-${taskId}`}>Title</label><input id={`edit-title-${taskId}`} name="title" required maxLength={200} defaultValue={title} className="h-9 rounded-md border bg-transparent px-2" />
    <label htmlFor={`edit-priority-${taskId}`}>Priority</label><NativeSelect id={`edit-priority-${taskId}`} name="priority" defaultValue={priority}>{["low","normal","high","urgent"].map(v=><option key={v} value={v}>{v}</option>)}</NativeSelect>
    <label htmlFor={`edit-assignee-${taskId}`}>Assigned employee</label><NativeSelect id={`edit-assignee-${taskId}`} name="assigneeId" defaultValue={assigneeId}><option value="">Unassigned</option>{assigneeId && !staff.some(s => s.id === assigneeId) && <option value={assigneeId}>Current assignee unavailable — choose another</option>}{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
    <label htmlFor={`edit-due-${taskId}`}>Due date</label><input id={`edit-due-${taskId}`} name="dueDate" type="date" defaultValue={dueDate} className="h-9 rounded-md border bg-transparent px-2" />
    <label htmlFor={`edit-mandatory-${taskId}`}>Closure requirement</label><NativeSelect id={`edit-mandatory-${taskId}`} name="mandatory" defaultValue={mandatory ? "true" : "false"}><option value="true">Required</option><option value="false">Optional</option></NativeSelect>
    <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save task"}</Button>{state.message && <p role="status" className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p>}
  </form></details>;
}
