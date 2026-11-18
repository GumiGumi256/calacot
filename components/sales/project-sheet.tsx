"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getPickers } from "@/lib/sales/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ProjectForm } from "./project-form";

type PickerData = { clients: Record<string, unknown>[]; owners: Record<string, unknown>[] };
export function ProjectSheet({ initialOpen, selectedClient }: { initialOpen: boolean; selectedClient?: { id: string; name: string } }) {
  const [open, setOpen] = useState(initialOpen);
  const [data, setData] = useState<PickerData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { orgSlug } = useAuth();
  useEffect(() => {
    if (!open) return;
    let active = true;
    void getPickers().then(result => { if (active) { setData(result); setError(""); } }).catch(() => { if (active) setError("Could not load clients and staff. Please try again."); });
    return () => { active = false; };
  }, [open, attempt]);
  function changeOpen(value: boolean) {
    setOpen(value);
    if (!value) {
      setData(null); setError("");
      if (params.has("new")) {
        const next = new URLSearchParams(params.toString());
        next.delete("new"); next.delete("clientId");
        router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
      }
    }
  }
  return <Sheet open={open} onOpenChange={changeOpen}>
    <SheetTrigger render={<Button />}>Create planned project</SheetTrigger>
    <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
      <SheetHeader className="border-b px-6 py-5 pr-14"><SheetTitle className="text-lg">New planned project</SheetTitle><SheetDescription>Pre-sales project. Confirmation will retain this project and its planned execution status.</SheetDescription></SheetHeader>
      <div className="flex-1 px-6 pt-6">
        {error ? <div role="alert" className="space-y-3 pb-6"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => { setError(""); setAttempt(n => n + 1); }}>Try again</Button></div> : !data ? <p role="status" className="pb-6 text-sm text-muted-foreground">Loading clients and staff…</p> : <>
          {selectedClient && <div className="mb-6 rounded-lg border bg-muted/40 px-4 py-3 text-sm"><span className="text-muted-foreground">Client</span><p className="font-medium">{selectedClient.name}</p></div>}
          <ProjectForm stickyActions clients={data.clients} owners={data.owners} clientId={selectedClient?.id} onCreated={id => { changeOpen(false); router.push(`${orgSlug ? `/${encodeURIComponent(orgSlug)}` : ""}/admin/projects/${id}`); router.refresh(); }} />
        </>}
      </div>
    </SheetContent>
  </Sheet>;
}
