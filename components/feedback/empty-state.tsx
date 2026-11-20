import type { ReactNode } from "react";
import { FileXIcon, InboxIcon, LockIcon, SearchXIcon, FilterXIcon, TriangleAlertIcon } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/**
 * Design System V1 empty states. Each kind answers a different question for the user:
 *   no-records    nothing exists yet          -> offer the create action (if permitted)
 *   no-results    the search matched nothing  -> echo the query, offer to clear it
 *   filtered-out  filters exclude everything  -> offer to clear filters
 *   restricted    the role cannot see this    -> say so plainly; no data was requested
 *   load-error    data could not be loaded    -> use <ErrorState> for a retry action
 */
export type EmptyKind = "no-records" | "no-results" | "filtered-out" | "restricted" | "load-error" | "missing";

const defaults: Record<EmptyKind, { icon: ReactNode; title: string; description: string }> = {
  "no-records": { icon: <InboxIcon />, title: "Nothing here yet", description: "Records you create will appear here." },
  "no-results": { icon: <SearchXIcon />, title: "No matching results", description: "Try a different search term." },
  "filtered-out": { icon: <FilterXIcon />, title: "No records match these filters", description: "Clear or change the filters to see more." },
  restricted: { icon: <LockIcon />, title: "Unavailable for your role", description: "Ask an administrator if you need access." },
  "load-error": { icon: <TriangleAlertIcon />, title: "This could not be loaded", description: "Nothing was changed. Try again in a moment." },
  missing: { icon: <FileXIcon />, title: "Not found", description: "It may have been removed, or the link is incorrect." },
};

export function EmptyState({
  kind,
  title,
  description,
  query,
  action,
  compact = false,
  className,
}: {
  kind: EmptyKind;
  title?: string;
  description?: ReactNode;
  /** The search term, echoed for no-results. */
  query?: string;
  /** Next step: a Button or Link. Omit when the user is not permitted to act. */
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const d = defaults[kind];
  const resolvedTitle = title ?? (kind === "no-results" && query ? `No results for “${query}”` : d.title);
  return (
    <Empty
      data-kind={kind}
      role={kind === "load-error" ? "alert" : undefined}
      className={cn(compact ? "gap-3 p-4" : "py-10", className)}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon" className={kind === "load-error" ? "bg-destructive-soft text-destructive-text" : undefined}>
          {d.icon}
        </EmptyMedia>
        <EmptyTitle>{resolvedTitle}</EmptyTitle>
        <EmptyDescription>{description ?? d.description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
