"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function ProjectsError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Projects" retry={unstable_retry} />;
}
