import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Standard page header (docs section C6): one <h1>, a one-sentence description, one primary
 * action and optional secondary actions. On phones the actions wrap below the title and the
 * primary action stays visible.
 */
export function PageHeader({
  title,
  description,
  primaryAction,
  secondaryActions,
  meta,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  /** Small context under the title, e.g. status badges or a freshness note. */
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="type-page-title [overflow-wrap:anywhere]">{title}</h1>
        {description && <p className="type-description max-w-prose">{description}</p>}
        {meta && <div className="mt-1 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {(primaryAction || secondaryActions) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:[&>*:last-child]:flex-1">
          {secondaryActions}
          {primaryAction}
        </div>
      )}
    </header>
  );
}
