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
          label="Start approval or deposit evidence"
          value={reason}
          onChange={setReason}
          required
          multiline
          hint="Note who approved the start and how the deposit requirement was met (e.g. deposit received on 3 March, ref MP12345). Confirming the quotation alone does not start the project."
        />
        <FormMessage>{message}</FormMessage>
        <Button type="submit" disabled={pending}>
          Start project
        </Button>
      </FieldGroup>
    </form>
  );
}
