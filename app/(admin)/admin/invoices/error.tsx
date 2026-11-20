"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function InvoicesError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Invoices" retry={unstable_retry} />;
}
