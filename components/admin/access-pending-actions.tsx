"use client";
import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function AccessPendingActions() {
  return (
    <div className="flex flex-wrap gap-3">
      {/* /auth/redirect re-resolves the organization and re-checks access server-side. */}
      <Button size="lg" className="rounded-full" nativeButton={false} render={<Link href="/auth/redirect" />}>Check again</Button>
      <SignOutButton redirectUrl="/">
        <Button type="button" size="lg" variant="outline" className="rounded-full">Sign out</Button>
      </SignOutButton>
    </div>
  );
}
