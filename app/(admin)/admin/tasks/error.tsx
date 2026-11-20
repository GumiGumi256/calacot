"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function ProjecttasksError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Project tasks" retry={unstable_retry} />;
}
