"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ExpenseForm } from "./expense-form";

type Project = { id: string; name: string; code: string; division: string; currency: string };

export function ProjectExpenseCreate({ project, suppliers, today }: { project: Project; suppliers: { id: string; name: string }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [requestKey, setRequestKey] = useState("");
  const [savedId, setSavedId] = useState("");

  function changeOpen(next: boolean) {
    if (next) { setRequestKey(crypto.randomUUID()); setSavedId(""); }
    setOpen(next);
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger render={<Button size="sm" />}>New expense</DialogTrigger>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>New project expense</DialogTitle>
        <DialogDescription>Save a draft, then attach receipts and submit it for review.</DialogDescription>
      </DialogHeader>
      {savedId ? <div className="flex flex-wrap items-center gap-3" role="status">
        <p>Draft saved for this project.</p>
        <Button render={<Link href={`/admin/expenses/${savedId}`} />}>Open draft to attach receipts and submit</Button>
        <Button variant="outline" onClick={() => changeOpen(false)}>Done</Button>
      </div> : requestKey && <ExpenseForm requestKey={requestKey} projects={[]} suppliers={suppliers} today={today} fixedProject={project} onSaved={setSavedId} />}
    </DialogContent>
  </Dialog>;
}
