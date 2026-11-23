import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { ModeToggle } from "./mode-toggle";
import { NotificationBell } from "./admin/notification-bell";

/*
 * Admin shell header (Design System V1, Phase 4). The page's own level-1 heading lives in PageHeader;
 * this bar only orients (breadcrumbs) and holds global controls, so it uses no heading.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 md:px-5 md:rounded-t-xl">
      <SidebarTrigger className="-ml-1 shrink-0" />
      <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-auto" />
      <div className="flex min-w-0 flex-1 items-center">
        <AdminBreadcrumbs />
      </div>
      <p className="hidden shrink-0 type-caption xl:block">Calacot Group Uganda Limited</p>
      <NotificationBell />
      <ModeToggle />
    </header>
  );
}
