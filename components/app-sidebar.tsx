"use client";
import * as React from "react";
import Image from "next/image";
import { useAuth } from "@clerk/nextjs";
import { LayoutDashboardIcon, UsersIcon, UserRoundIcon, HeadsetIcon, FileTextIcon, ReceiptIcon, CreditCardIcon, WalletIcon, FolderIcon, ShoppingBagIcon, MessageSquareIcon, ListChecksIcon, ChartColumnIcon, LandmarkIcon, UsersRoundIcon, SettingsIcon } from "lucide-react";
import { NavItems } from "@/components/nav-documents";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { visibleNavigation } from "@/lib/admin/navigation";
import type { Permission } from "@/lib/sales/permissions";

const icons: Record<string, React.ReactNode> = {
  Dashboard: <LayoutDashboardIcon />, Leads: <UserRoundIcon />, Clients: <UsersIcon />,
  Quotations: <FileTextIcon />, "Customer care": <HeadsetIcon />, Invoices: <ReceiptIcon />,
  Payments: <CreditCardIcon />, Expenses: <WalletIcon />, "Financial reports": <ChartColumnIcon />, "Payment accounts": <LandmarkIcon />, Staff: <UsersRoundIcon />, "Company settings": <SettingsIcon />, Projects: <FolderIcon />,
  Tasks: <ListChecksIcon />,
  "Design Orders": <ShoppingBagIcon />, "Delivery operations": <MessageSquareIcon />,
};
export function AppSidebar({ role, permissions, ...props }: React.ComponentProps<typeof Sidebar> & { role: string; permissions: Permission[] }) {
  const { orgSlug } = useAuth();
  const items = visibleNavigation(role, permissions).map(item => ({ ...item, icon: icons[item.name], url: orgSlug ? `/${encodeURIComponent(orgSlug)}${item.url}` : item.url }));
  return <Sidebar collapsible="icon" {...props}>
    <SidebarHeader><SidebarMenu><SidebarMenuItem><SidebarMenuButton className="data-[slot=sidebar-menu-button]:p-1.5!"><div>
      <div className="group-data-[collapsible=icon]:hidden"><Image src="/calacot-logo-vertical-white.svg" width={140} height={60} alt="Calacot" className="hidden object-contain dark:block" /><Image src="/calacot-logo-vertical-black.svg" width={140} height={60} alt="Calacot" className="block object-contain dark:hidden" /></div>
      <div className="hidden group-data-[collapsible=icon]:block"><Image src="/calacot-logo-icon-white.svg" width={40} height={40} alt="Calacot" className="hidden object-contain dark:block" /><Image src="/calacot-logo-icon-black.svg" width={40} height={40} alt="Calacot" className="block object-contain dark:hidden" /></div>
    </div></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarHeader>
    <SidebarContent><NavMain items={items.filter(i => i.group === "main").map(i => ({ ...i, title: i.name }))} />
      <NavItems title="Sales & Clients" items={items.filter(i => i.group === "sales")} />
      <NavItems title="Finance" items={items.filter(i => i.group === "finance")} />
      <NavItems title="Operations" items={items.filter(i => i.group === "operations")} />
      <NavItems title="Administration" items={items.filter(i => i.group === "administration")} />
    </SidebarContent><SidebarFooter><NavUser /></SidebarFooter>
  </Sidebar>;
}
