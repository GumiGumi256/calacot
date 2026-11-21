"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function AccountingError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Event mappings" retry={unstable_retry} />;
}
