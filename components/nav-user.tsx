"use client";

import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

export function NavUser() {
  return (
    <SidebarMenu className="gap-2">
      <SidebarMenuItem className="min-w-0 px-2">
        <p className="mb-1 px-1 text-xs font-medium text-muted-foreground group-data-[collapsible=icon]:sr-only">
          Workspace
        </p>
        <OrganizationSwitcher />
      </SidebarMenuItem>
      <SidebarMenuItem className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-medium text-muted-foreground group-data-[collapsible=icon]:sr-only">
          Account
        </span>
        <UserButton />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
