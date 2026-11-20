import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { staffAccessStatus, staffContext } from "@/lib/sales/permissions";
import { SalesSetupState } from "@/lib/sales/setup-state";
import { requireUser } from "@/lib/design-purchases/permissions";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export const metadata: Metadata = { robots: { index: false, follow: false } };
/*
 * Cache Components: everything below depends on the signed-in user, so it renders at request time
 * inside a Suspense boundary. The static shell is the quiet frame in AdminShellFallback; pages then
 * stream in, and their data comes from per-organization caches (lib/cache-tags.ts).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AdminShellFallback />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

function AdminShellFallback() {
  return (
    <div data-surface="admin" className="flex min-h-svh bg-sidebar" aria-busy="true">
      <div className="hidden w-64 shrink-0 md:block" />
      <div className="m-2 flex-1 rounded-[2rem] bg-background md:ml-0">
        <p role="status" className="sr-only">Loading the Calacot admin…</p>
      </div>
    </div>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
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
      data-surface="admin"
      style={
        {
          // Design System V1 shell: 256px sidebar, 56px header (docs C3).
          "--sidebar-width": "calc(var(--spacing) * 64)",
          "--header-height": "calc(var(--spacing) * 14)",
        } as React.CSSProperties
      }
    >
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <AppSidebar variant="inset" role={context.role} permissions={context.permissions} />
      {/* min-w-0: let wide tables scroll inside the content column instead of widening the page. */}
      <SidebarInset className="min-w-0 md:peer-data-[variant=inset]:rounded-[2rem] md:peer-data-[variant=inset]:shadow-card">
        {/* The rounded content panel frames the cards; its corners are a step larger than --card-radius. */}
        <SiteHeader />
        {/* The shell owns the page's single main landmark; pages render plain containers inside it. */}
        <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
