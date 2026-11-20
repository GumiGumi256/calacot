"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function QuotationsError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Quotations" retry={unstable_retry} />;
}
