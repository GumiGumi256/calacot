import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRightIcon, ArrowUpRightIcon, ChevronRightIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/charts/sparkline";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MetricState = "ready" | "loading" | "restricted" | "error";

/**
 * A KPI that supports a decision. Mirrors lib/admin/dashboard MetricResult states so a metric
 * that cannot be read says so instead of showing zero. A delta is shown only when the caller
 * computed one from complete, comparable periods (see periodChange in lib/charts/config).
 */
export function MetricCard({
  label,
  value,
  values,
  icon,
  state = "ready",
  delta,
  goodWhen = "up",
  note,
  href,
  hrefLabel,
  trend,
  className,
}: {
  label: string;
  /** Single figure, already formatted (use lib/format). */
  value?: ReactNode;
  /** Several figures, e.g. one per currency. Never sum UGX and USD. */
  values?: { key: string; value: ReactNode }[];
  icon?: ReactNode;
  state?: MetricState;
  /** Ratio change vs. the comparison period, or null to hide. */
  delta?: number | null;
  goodWhen?: "up" | "down";
  /** Comparison or context, e.g. "vs. October" or "3 invoices". */
  note?: ReactNode;
  href?: string;
  hrefLabel?: string;
  trend?: (number | null)[];
  className?: string;
}) {
  const hasDelta = state === "ready" && delta !== undefined && delta !== null && Number.isFinite(delta);
  const positive = hasDelta && (delta as number) > 0;
  const good = hasDelta && (delta === 0 || positive === (goodWhen === "up"));
  const body = (
    <>
      <div className="flex items-center gap-2 type-label text-muted-foreground">
        {icon && <span aria-hidden className="flex size-7 items-center justify-center rounded-md bg-surface-subtle text-foreground [&_svg]:size-4">{icon}</span>}
        <span className="min-w-0 truncate">{label}</span>
        {href && state === "ready" && <ChevronRightIcon aria-hidden className="ml-auto size-4 opacity-60 transition-opacity group-hover/card:opacity-100" />}
      </div>
      {state === "loading" && (
        <div role="status" aria-label={`Loading ${label}`} className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      )}
      {state === "restricted" && <p className="type-description">Unavailable for your role.</p>}
      {state === "error" && <p role="status" className="type-body text-destructive">Could not load. Refresh to try again.</p>}
      {state === "ready" && (
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {values ? (
              values.length ? (
                <ul className="flex flex-col gap-0.5">
                  {values.map((v, i) => (
                    <li key={v.key} className={i === 0 ? "type-metric" : "type-metric-sm"}>{v.value}</li>
                  ))}
                </ul>
              ) : (
                <p className="type-description">No records yet.</p>
              )
            ) : (
              <p className="type-metric">{value}</p>
            )}
            {(hasDelta || note) && (
              <p className="flex flex-wrap items-center gap-1.5 type-caption">
                {hasDelta && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums",
                      good ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive-text",
                    )}
                  >
                    {positive ? <ArrowUpRightIcon aria-hidden className="size-3" /> : <ArrowDownRightIcon aria-hidden className="size-3" />}
                    <span className="sr-only">{positive ? "Up" : "Down"} </span>
                    {formatPercent(Math.abs(delta as number))}
                  </span>
                )}
                {note && <span className="min-w-0">{note}</span>}
              </p>
            )}
          </div>
          {trend && <Sparkline values={trend} className="mb-1 shrink-0" />}
        </div>
      )}
    </>
  );
  const card = (
    <Card variant={href && state === "ready" ? "interactive" : "default"} className={cn("min-w-0 gap-3 px-(--card-spacing)", className)}>
      {body}
    </Card>
  );
  if (!href || state !== "ready") return card;
  return (
    <Link href={href} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      {card}
      {hrefLabel && <span className="sr-only">{hrefLabel}</span>}
    </Link>
  );
}

export function MetricRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}
