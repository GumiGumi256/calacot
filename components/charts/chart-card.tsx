"use client";

import { useState, type ReactNode } from "react";
import { BarChart3Icon, InfoIcon, TableIcon } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { ChartSkeleton } from "@/components/feedback/skeletons";
import { cn } from "@/lib/utils";

export type ChartState = "ready" | "loading" | "empty" | "filtered" | "error" | "restricted";

/**
 * Standard chart anatomy (docs section G4): header (title, one-line description, info, controls),
 * a fixed-height plot so layouts never jump, and an optional footer for a computed insight,
 * freshness note or a link to the underlying records. Every state keeps the card in place.
 * `table` is the accessible alternative and the mobile fallback ("View as table").
 */
export function ChartCard({
  title,
  description,
  info,
  controls,
  state = "ready",
  emptyMessage,
  onClearFilters,
  onRetry,
  table,
  footer,
  height = 280,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  /** Definition of the metric (shown in a tooltip). */
  info?: string;
  /** Period selector or contextual action. */
  controls?: ReactNode;
  state?: ChartState;
  emptyMessage?: string;
  onClearFilters?: () => void;
  onRetry?: () => void;
  table?: ReactNode;
  footer?: ReactNode;
  height?: number;
  children?: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  if (state === "restricted") {
    return (
      <Card className={className}>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent><EmptyState kind="restricted" compact /></CardContent>
      </Card>
    );
  }
  const plot = (() => {
    switch (state) {
      case "loading":
        return <ChartSkeleton height={height} />;
      case "error":
        return <div style={{ minHeight: height }} className="flex items-center justify-center"><ErrorState compact onRetry={onRetry} title="This chart could not be loaded" /></div>;
      case "empty":
        return <div style={{ minHeight: height }} className="flex items-center justify-center"><EmptyState kind="no-records" compact title={emptyMessage ?? "No data for this period"} description="Change the period to see more." /></div>;
      case "filtered":
        return (
          <div style={{ minHeight: height }} className="flex items-center justify-center">
            <EmptyState kind="filtered-out" compact action={onClearFilters && <Button variant="outline" size="sm" onClick={onClearFilters}>Clear filters</Button>} />
          </div>
        );
      default:
        return asTable && table ? <div className="overflow-x-auto" style={{ minHeight: height }}>{table}</div> : <div style={{ height }} className="w-full min-w-0">{children}</div>;
    }
  })();
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {title}
          {info && (
            <Tooltip>
              <TooltipTrigger render={<button type="button" className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label={`About ${title}`} />}>
                <InfoIcon aria-hidden className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{info}</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {(controls || (table && state === "ready")) && (
          <CardAction className="flex items-center gap-2">
            {controls}
            {table && state === "ready" && (
              <Button variant="ghost" size="icon-sm" aria-pressed={asTable} aria-label={asTable ? "View as chart" : "View as table"} onClick={() => setAsTable((v) => !v)}>
                {asTable ? <BarChart3Icon /> : <TableIcon />}
              </Button>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{plot}</CardContent>
      {footer && state === "ready" && <CardFooter className="flex-wrap gap-x-4 gap-y-1 type-caption">{footer}</CardFooter>}
    </Card>
  );
}
