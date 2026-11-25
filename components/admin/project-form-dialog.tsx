"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ProjectFormDialog({ title, children, variant = "outline", icon }: { title: string; children: ReactNode; variant?: "outline" | "ghost"; icon?: ReactNode }) {
  return <Dialog>
    <DialogTrigger render={<Button type="button" size="sm" variant={variant} className="min-h-11 sm:min-h-0" />}>{icon}{title}</DialogTrigger>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      {children}
    </DialogContent>
  </Dialog>;
}
