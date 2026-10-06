"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startProject } from "@/lib/sales/actions";
import { FieldGroup } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { TextField, FormMessage } from "./form-controls";
export function ProjectStart({ id }: { id: string }) {
  const router = useRouter(),
    [pending, start] = useTransition(),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await startProject(id, reason);
          if (r.ok) router.refresh();
          else setMessage(r.error);
        });
      }}
    >
      <FieldGroup>
        <TextField
          label="Start approval / deposit requirement evidence"
          value={reason}
          onChange={setReason}
          required
          multiline
          hint="Record the team's explicit start approval. Confirming an agreement does not start execution."
        />
        <FormMessage>{message}</FormMessage>
        <Button type="submit" disabled={pending}>
          Explicitly start execution
        </Button>
      </FieldGroup>
    </form>
  );
}
