import "server-only";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
export const permissions = [
  "clients_read",
  "clients_write",
  "projects_read",
  "projects_write",
  "quotations_read",
  "quotations_create",
  "quotations_edit",
  "quotations_send",
  "quotations_confirm",
  "invoices_read",
  "invoices_issue",
  "invoices_void",
  "payments_verify",
  "notifications_manage",
] as const;
export type Permission = (typeof permissions)[number];
export function roleAllows(role: string | null | undefined, p: Permission) {
  if (role === "org:admin") return true;
  const grants: Record<string, readonly Permission[]> = {
    "org:sales": [
      "clients_read",
      "clients_write",
      "projects_read",
      "projects_write",
      "quotations_read",
      "quotations_create",
      "quotations_edit",
      "quotations_send",
      "invoices_read",
    ],
    "org:finance": [
      "clients_read",
      "projects_read",
      "quotations_read",
      "quotations_confirm",
      "invoices_read",
      "invoices_issue",
      "invoices_void",
      "payments_verify",
      "notifications_manage",
    ],
    "org:viewer": [
      "clients_read",
      "projects_read",
      "quotations_read",
      "invoices_read",
    ],
  };
  return grants[role || ""]?.includes(p) ?? false;
}
export async function staffContext(required?: Permission) {
  const session = await auth();
  if (!session.userId)
    return session.redirectToSignIn({ returnBackUrl: "/admin/clients" });
  const configured = process.env.CALACOT_CLERK_ORG_ID?.trim();
  if (!configured || session.orgId !== configured || !session.orgRole)
    notFound();
  const routeSlug = (await headers()).get("x-calacot-org-slug");
  if (routeSlug && routeSlug !== session.orgSlug) notFound();
  const grants = permissions.filter(
    (p) =>
      roleAllows(session.orgRole, p) ||
      session.has({ permission: `org:calacot:${p}` }),
  );
  if (!grants.length || (required && !grants.includes(required))) notFound();
  return {
    organizationId: configured,
    actor: session.userId,
    permissions: grants,
  };
}
