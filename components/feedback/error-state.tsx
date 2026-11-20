"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";

/**
 * A failed load that stays in place (it never makes a section disappear) and offers a safe retry.
 * By default Retry re-runs the server render for the current URL, keeping filters and inputs.
 * Pass onRetry for client-fetched data, or for an error.tsx boundary's reset().
 */
export function ErrorState({
  title = "This could not be loaded",
  description = "Nothing was changed. Check your connection and try again.",
  onRetry,
  extraAction,
  compact,
  className,
}: {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  extraAction?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const retry = () => start(() => (onRetry ? onRetry() : router.refresh()));
  return (
    <EmptyState
      kind="load-error"
      title={title}
      description={description}
      compact={compact}
      className={className}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" size="sm" loading={pending} onClick={retry}>
            {!pending && <RotateCwIcon />}
            Retry
          </Button>
          {extraAction}
        </div>
      }
    />
  );
}
