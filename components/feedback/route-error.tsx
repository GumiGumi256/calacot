"use client";

import { ErrorState } from "./error-state";

/**
 * The shared body of an admin error.tsx boundary (docs C9). Keeps the page title so people know
 * where they are, says nothing was changed, and retries with Next 16's unstable_retry, which
 * re-fetches the segment (reset() would only re-render the failed tree).
 */
export function RouteError({ title, what, retry }: { title: string; what?: string; retry: () => void }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6 p-4 md:p-6 2xl:p-8">
      <h1 className="type-page-title">{title}</h1>
      <div className="surface-card overflow-hidden">
        <ErrorState
          title={`${what ?? title} could not be loaded`}
          description="Nothing was changed. Your search and filters are kept in the address bar, so retrying keeps them."
          onRetry={retry}
        />
      </div>
    </div>
  );
}
