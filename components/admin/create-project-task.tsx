"use client";
import { useActionState } from "react";
import { createProjectTask } from "@/lib/projects/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
export function CreateProjectTask({ projectId, taskId, staff }: { projectId: string; taskId: string; staff: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createProjectTask, { ok: false, message: "" });
  if (state.ok) return <p role="status" className="text-sm">{state.message} Refresh to add another task.</p>;
  return <details className="rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-3"><summary className="cursor-pointer text-sm font-medium">Add task</summary><form action={action} className="mt-3 flex flex-col gap-2">
    <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="taskId" value={taskId} />
    <label htmlFor="task-title" className="text-sm">Task title</label><input id="task-title" name="title" required maxLength={200} className="h-9 rounded-md border bg-transparent px-3" />
    <label htmlFor="task-priority" className="text-sm">Priority</label><NativeSelect id="task-priority" name="priority" defaultValue="normal">{["low","normal","high","urgent"].map(v=><option key={v} value={v}>{v}</option>)}</NativeSelect>
    <label htmlFor="task-assignee" className="text-sm">Assigned employee</label><NativeSelect id="task-assignee" name="assigneeId" defaultValue=""><option value="">Unassigned</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
    <label htmlFor="task-due" className="text-sm">Due date</label><input id="task-due" name="dueDate" type="date" className="h-9 rounded-md border bg-transparent px-3" />
    <label htmlFor="task-mandatory" className="text-sm">Closure requirement</label><NativeSelect id="task-mandatory" name="mandatory" defaultValue="true"><option value="true">Required</option><option value="false">Optional</option></NativeSelect>
    <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create task"}</Button>{state.message && <p role="status" className="text-sm text-destructive">{state.message}</p>}
  </form></details>;
}
