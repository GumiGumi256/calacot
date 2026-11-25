"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ExpenseForm, type PayeeMember } from "./expense-form";
import type { VerifiedPaymentOptions } from "@/lib/finance/options";

type Project = { id: string; name: string; code: string; division: string; currency: string };

export function ProjectExpenseCreate({ project, suppliers, members, today, verified }: { project: Project; suppliers: { id: string; name: string }[]; members: PayeeMember[]; today: string; verified?: VerifiedPaymentOptions | null }) {
  const [open, setOpen] = useState(false);
  const [requestKey, setRequestKey] = useState("");
  const [savedId, setSavedId] = useState("");
  const [savedVerified, setSavedVerified] = useState(false);

  function changeOpen(next: boolean) {
    if (next) { setRequestKey(crypto.randomUUID()); setSavedId(""); }
    setOpen(next);
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger render={<Button size="sm" />}><Plus aria-hidden="true" />{verified ? "Add expense" : "New expense"}</DialogTrigger>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>New project expense</DialogTitle>
        <DialogDescription>{verified ? "As an administrator you can add a verified expense in one step. It is recorded in the expense history." : "Save a draft, then attach receipts and submit it for review."}</DialogDescription>
      </DialogHeader>
      {savedId ? <div className="flex flex-wrap items-center gap-3" role="status">
        <p>{savedVerified ? "Verified expense added to this project." : "Draft saved for this project."}</p>
        <Button render={<Link href={`/admin/expenses/${savedId}`} />}>{savedVerified ? "Open expense to attach receipts" : "Open draft to attach receipts and submit"}</Button>
        {savedVerified && <Button variant="outline" onClick={() => { setRequestKey(crypto.randomUUID()); setSavedId(""); }}>Add another</Button>}
        <Button variant="outline" onClick={() => changeOpen(false)}>Done</Button>
      </div> : requestKey && <ExpenseForm requestKey={requestKey} projects={[]} suppliers={suppliers} members={members} today={today} fixedProject={project} verified={verified} onSaved={(id, v) => { setSavedId(id); setSavedVerified(v); }} />}
    </DialogContent>
  </Dialog>;
}
