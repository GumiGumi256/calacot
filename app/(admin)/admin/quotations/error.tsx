"use client";

import { ErrorState } from "@/components/feedback/error-state";

// Next 16: unstable_retry re-fetches and re-renders the segment (reset() would not re-fetch).
export default function QuotationsError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="type-page-title">Quotations</h1>
      <div className="rounded-xl border bg-card">
        <ErrorState
          title="Quotations could not be loaded"
          description="Nothing was changed. Your search and filters are kept in the address bar, so retrying keeps them."
          onRetry={unstable_retry}
        />
      </div>
    </div>
  );
}
