"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function FinancialreportsError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Financial reports" retry={unstable_retry} />;
}
