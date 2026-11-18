"use client";
import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function AccessPendingActions() {
  return (
    <div className="flex flex-wrap gap-2">
      {/* /auth/redirect re-resolves the organization and re-checks access server-side. */}
      <Button render={<Link href="/auth/redirect" />}>Check again</Button>
      <SignOutButton redirectUrl="/">
        <Button type="button" variant="outline">Sign out</Button>
      </SignOutButton>
    </div>
  );
}
