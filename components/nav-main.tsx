"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { isActivePath } from "@/lib/admin/breadcrumbs";

/*
 * Active navigation (Design System V1): the current section gets the sidebar accent fill,
 * medium weight, a gold inline-start indicator and aria-current="page". Item URLs already
 * carry the organization prefix, so they are compared with the raw pathname.
 */
export const activeItemClass =
  "relative data-active:before:absolute data-active:before:inset-y-2 data-active:before:left-0 data-active:before:w-0.75 data-active:before:rounded-full data-active:before:bg-sidebar-primary data-active:before:content-['']";

export function NavMain({ items }: { items: { title: string; url: string; icon?: React.ReactNode }[] }) {
  const pathname = usePathname();
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActivePath(pathname, item.url);
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={active}
                  className={activeItemClass}
                  render={<Link href={item.url} aria-current={active ? "page" : undefined} />}
                >
                  {item.icon}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
