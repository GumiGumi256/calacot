"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function ReportsError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Reports" retry={unstable_retry} />;
}
