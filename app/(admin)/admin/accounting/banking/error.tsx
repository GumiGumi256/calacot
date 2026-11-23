"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function BankingError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Banking & cash" retry={unstable_retry} />;
}
