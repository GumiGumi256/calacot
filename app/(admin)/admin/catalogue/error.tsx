"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function ItemcatalogueError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError title="Item catalogue" retry={unstable_retry} />;
}
