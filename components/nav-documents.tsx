"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { isActivePath } from "@/lib/admin/breadcrumbs";
import { activeItemClass, useCloseMobileSidebar } from "@/components/nav-main";

export function NavItems({ items, title }: { title: string; items: { name: string; url: string; icon: React.ReactNode }[] }) {
  const pathname = usePathname();
  const close = useCloseMobileSidebar();
  if (!items.length) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const active = isActivePath(pathname, item.url);
          return (
            <SidebarMenuItem key={item.name}>
              <SidebarMenuButton
                tooltip={item.name}
                isActive={active}
                className={activeItemClass}
                render={<Link href={item.url} aria-current={active ? "page" : undefined} onClick={close} />}
              >
                {item.icon}
                <span>{item.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
