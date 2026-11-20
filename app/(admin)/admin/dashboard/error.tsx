"use client";
import { Button } from "@/components/ui/button";
export default function DashboardError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <div className="space-y-4 p-4 md:p-6"><h1 className="text-2xl font-semibold">Dashboard unavailable</h1><p role="alert">The dashboard could not be loaded. Please try again.</p><Button onClick={() => unstable_retry()}>Try again</Button></div>;
}
