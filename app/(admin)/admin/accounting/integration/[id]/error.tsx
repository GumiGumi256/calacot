"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function AccountingError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Accounting event" retry={unstable_retry} />;
}
