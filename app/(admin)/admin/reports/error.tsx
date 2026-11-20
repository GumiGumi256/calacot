"use client";
import { Button } from "@/components/ui/button";
export default function AdminError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <div className="space-y-4 p-4 md:p-6"><h1 className="text-xl font-semibold">Reports unavailable</h1><p role="alert">This page could not be loaded. No changes were made. Please try again.</p><Button onClick={() => unstable_retry()}>Try again</Button></div>;
}
