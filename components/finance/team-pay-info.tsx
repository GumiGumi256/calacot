"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function TeamPayInfo() {
  return <TooltipProvider><Tooltip><TooltipTrigger render={<button type="button" aria-label="About team pay" className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />}><Info className="size-4" /></TooltipTrigger><TooltipContent>A share counts as paid when its expense is paid in full. Drafts, returned, rejected and cancelled expenses are excluded. Still owed is agreed pay minus paid shares.</TooltipContent></Tooltip></TooltipProvider>;
}
