import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { staffAccessStatus, staffContext } from "@/lib/sales/permissions";
import { SalesSetupState } from "@/lib/sales/setup-state";
import { requireUser } from "@/lib/design-purchases/permissions";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!process.env.CALACOT_CLERK_ORG_ID?.trim()) {
    await requireUser("/admin/clients");
    return <SalesSetupState />;
  }
  // Confirmed members without usable access (awaiting approval/role, or paused) get a
  // friendly holding page instead of a 404. Non-members still receive a plain 404 below.
  const access = await staffAccessStatus();
  if (access.kind === "awaiting_assignment" || access.kind === "paused") redirect("/access-pending");
  const context = await staffContext();
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" role={context.role} permissions={context.permissions} />
      <SidebarInset>
        <SiteHeader />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
