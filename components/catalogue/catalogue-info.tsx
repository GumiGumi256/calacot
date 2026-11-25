"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function CatalogueInfo() {
  return <TooltipProvider><Tooltip><TooltipTrigger render={<button type="button" aria-label="About the item catalogue" className="inline-flex rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />}><Info className="size-4" /></TooltipTrigger><TooltipContent>Default items and selling prices for quotations, starting with the Painting division. Prices are defaults for new quotation lines; issued quotations keep the prices they were issued with.</TooltipContent></Tooltip></TooltipProvider>;
}
