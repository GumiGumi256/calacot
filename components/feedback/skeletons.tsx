import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Layout-preserving loading placeholders. Each mirrors the real component's geometry so
 * content does not jump when data arrives. Wrappers announce loading once, not per bar.
 */

function Busy({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={cn("motion-reduce:[&_[data-slot=skeleton]]:animate-none", className)}>
      {children}
    </div>
  );
}

export function TableSkeleton({ rows = 8, columns = 5, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <Busy label="Loading records" className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className="flex gap-4 border-b bg-surface-subtle px-4 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-13 items-center gap-4 border-b px-4 last:border-0">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn("h-3.5 flex-1", c === 0 && "max-w-48", c === columns - 1 && "max-w-10")} />
          ))}
        </div>
      ))}
    </Busy>
  );
}

export function MetricSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <Busy label="Loading figures" className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </Busy>
  );
}

export function ChartSkeleton({ height = 280, className }: { height?: number; className?: string }) {
  const bars = [45, 70, 55, 85, 60, 90, 50, 75];
  return (
    <Busy label="Loading chart" className={cn("flex items-end gap-3 px-2", className)}>
      <div className="flex w-full items-end gap-3" style={{ height }}>
        {bars.map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
        ))}
      </div>
    </Busy>
  );
}

export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <Busy label="Loading" className={cn("flex flex-col gap-3 rounded-xl border bg-card p-5", className)}>
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </Busy>
  );
}

/** Page-level skeleton for loading.tsx: header, optional metrics, then a table. */
export function PageSkeleton({ title, metrics = 0 }: { title: string; metrics?: number }) {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="type-page-title">{title}</h1>
        <Skeleton className="h-9 w-32" />
      </div>
      {metrics > 0 && <MetricSkeleton count={metrics} />}
      <TableSkeleton />
    </div>
  );
}
