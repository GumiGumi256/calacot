import Link from "next/link";
import { ArrowRightIcon, CircleAlertIcon, TriangleAlertIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type AttentionEntry = { key: string; label: string; count: number; href?: string; tone: "warning" | "destructive" };

/**
 * "What needs my attention?" (docs C6 B). Renders nothing when there is nothing to do, so calm
 * pages stay calm. Each item states a count and links to the exact filtered list behind it.
 * When the check itself failed, says so instead of implying there is nothing to do.
 */
export function AttentionStrip({
  title = "Needs attention",
  items,
  failed = false,
}: {
  title?: string;
  items: AttentionEntry[];
  failed?: boolean;
}) {
  if (!items.length && !failed) return null;
  const urgent = items.some((i) => i.tone === "destructive");
  return (
    <Card variant="attention" tone={urgent ? "destructive" : "warning"} size="sm" className="gap-2 px-(--card-spacing)">
      <section aria-labelledby="attention-title" className="flex flex-col gap-2">
        <h2 id="attention-title" className="flex items-center gap-2 type-card-title">
          <TriangleAlertIcon aria-hidden className={cn("size-4", urgent ? "text-destructive-text" : "text-warning")} />
          {title}
        </h2>
        {items.length > 0 && (
          <ul className="flex flex-col divide-y">
            {items.map((item) => {
              const body = (
                <>
                  <span className={cn("min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums", item.tone === "destructive" ? "bg-destructive-soft text-destructive-text" : "bg-warning-soft text-warning")}>
                    {item.count}
                  </span>
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {item.href && <ArrowRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />}
                </>
              );
              return (
                <li key={item.key}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-2 type-body outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {body}
                      <span className="sr-only">: review</span>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 py-2 type-body">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {failed && (
          <p role="status" className="flex items-center gap-2 type-caption">
            <CircleAlertIcon aria-hidden className="size-3.5" />
            Some items could not be checked. Refresh to try again.
          </p>
        )}
      </section>
    </Card>
  );
}
