"use client";

import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import { UserButton } from "@clerk/nextjs";

/*
 * Sidebar footer (Design System V1): the signed-in person's account menu as one full-width row
 * that looks and behaves like the navigation items above it (36px row, 44px on touch screens,
 * sidebar accent on hover). Collapsed to the icon rail, only the avatar remains.
 *
 * There is no organization switcher: Calacot runs as a single organization. People and
 * invitations are managed on the Staff page (role rules, divisions, audit), and business
 * settings on Company settings, rather than through Clerk's built-in organization screens.
 *
 * Clerk styles its own components; the trailing "!" makes these utilities win over them.
 */
const row =
  "w-full! justify-start! gap-2! rounded-md! px-2! py-1.5! min-h-9! pointer-coarse:min-h-11! shadow-none! text-sidebar-foreground! hover:bg-sidebar-accent! focus-visible:ring-2! focus-visible:ring-sidebar-ring! group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center!";

export function NavUser() {
  return (
    <SidebarMenu className="border-t border-sidebar-border pt-2">
      <SidebarMenuItem className="min-w-0">
        <UserButton
          showName
          appearance={{
            elements: {
              rootBox: "w-full!",
              userButtonTrigger: row,
              userButtonBox: "w-full! flex-row-reverse! justify-end! gap-2! min-w-0!",
              userButtonAvatarBox: "size-6!",
              userButtonOuterIdentifier:
                "pl-0! text-sm! font-medium! text-sidebar-foreground! truncate! group-data-[collapsible=icon]:hidden!",
            },
          }}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
