"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function CompanysettingsError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Company settings" retry={unstable_retry} />;
}
