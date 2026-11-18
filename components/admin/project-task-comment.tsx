"use client";
import { useActionState } from "react";
import { addProjectTaskComment } from "@/lib/projects/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
export function ProjectTaskComment({ projectId, taskId, commentId }: { projectId: string; taskId: string; commentId: string }) {
  const [state, action, pending] = useActionState(addProjectTaskComment, { ok: false, message: "" });
  if (state.ok) return <p role="status" className="text-sm">{state.message} Refresh to add another comment.</p>;
  return <form action={action} className="flex flex-col gap-2"><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="commentId" value={commentId} />
    <label htmlFor={`comment-${taskId}`} className="text-sm">Internal progress update</label><Textarea id={`comment-${taskId}`} name="body" required maxLength={4000} />
    <Button size="sm" type="submit" variant="outline" disabled={pending}>{pending ? "Saving…" : "Add update"}</Button>{state.message && <p role="status" className="text-sm text-destructive">{state.message}</p>}
  </form>;
}
