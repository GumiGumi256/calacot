"use client";
import Link from "next/link";
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
export function NavItems({ items, title }: { title: string; items: { name: string; url: string; icon: React.ReactNode }[] }) {
  if (!items.length) return null;
  return <SidebarGroup><SidebarGroupLabel>{title}</SidebarGroupLabel><SidebarMenu>{items.map(item => <SidebarMenuItem key={item.name}><SidebarMenuButton tooltip={item.name} render={<Link href={item.url} />}>{item.icon}<span>{item.name}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroup>;
}
