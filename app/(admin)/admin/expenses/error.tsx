"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function ExpensesError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Expenses" retry={unstable_retry} />;
}
