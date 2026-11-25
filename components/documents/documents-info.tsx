"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function DocumentsInfo() {
  return <TooltipProvider><Tooltip><TooltipTrigger render={<button type="button" aria-label="About documents" className="inline-flex rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />}><Info className="size-4" /></TooltipTrigger><TooltipContent>Store contracts, drawings, permits and other files linked to clients, projects, tasks, milestones, employees and company records. You only see documents for records you can access.</TooltipContent></Tooltip></TooltipProvider>;
}
