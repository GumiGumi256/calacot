import "server-only";
import { staffContext, type Permission } from "@/lib/sales/permissions";

/**
 * Session check plus a fresh live Clerk membership read (no cache) for mutations. A removed
 * or demoted user is refused immediately even while their session token is valid; employee
 * eligibility and suspension are applied; fails closed when Clerk cannot be reached.
 */
export async function liveStaffContext(required: Permission) {
  return staffContext(required, "fresh");
}
