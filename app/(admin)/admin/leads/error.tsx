"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function LeadsError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Leads" retry={unstable_retry} />;
}
