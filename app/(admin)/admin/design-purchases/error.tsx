"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function DesignpurchasesError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Design purchases" retry={unstable_retry} />;
}
