import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Standard admin page wrapper (docs C3/C6). A plain <div>: the admin layout owns the single
 * <main>. Gutters 16px / 24px / 32px; 24px between sections. `width="reading"` caps forms and
 * detail pages at 1200px; tables use the full width.
 */
export function PageContainer({
  children,
  width = "full",
  className,
}: {
  children: ReactNode;
  width?: "full" | "reading";
  className?: string;
}) {
  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-6 p-4 md:p-6 2xl:p-8", width === "reading" && "mx-auto max-w-[75rem]", className)}>
      {children}
    </div>
  );
}
