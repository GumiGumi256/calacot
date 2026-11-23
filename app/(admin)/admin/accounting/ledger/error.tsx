"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function SectionError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="General ledger" retry={unstable_retry} />;
}
