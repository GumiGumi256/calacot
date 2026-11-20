"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function StaffError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Staff" retry={unstable_retry} />;
}
