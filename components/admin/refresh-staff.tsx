"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { reconcileStaffMemberships } from "@/lib/admin/staff-reconciliation";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/feedback/notify";

/**
 * Secondary page action: re-reads memberships and roles from Clerk (the source of truth),
 * then reloads the list so the result is visible. Outcome is announced with a toast instead
 * of inline text, so the header does not shift.
 */
export function RefreshStaff() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const sync = () =>
    start(async () => {
      const result = await reconcileStaffMemberships();
      if (result.ok) {
        notify.success("Staff synced with Clerk", result.message);
        router.refresh();
      } else {
        notify.error("Staff sync did not finish", { description: result.message, retry: sync });
      }
    });
  return (
    <Button type="button" variant="outline" loading={pending} onClick={sync} title="Re-read memberships and roles from Clerk">
      {!pending && <RefreshCwIcon />}
      {pending ? "Syncing…" : "Sync with Clerk"}
    </Button>
  );
}
