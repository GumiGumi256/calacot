"use client";

import * as React from "react";
import Image from "next/image";
import {
  LayoutDashboardIcon,
  UsersIcon,
  UserRoundIcon,
  HeadsetIcon,
  FileTextIcon,
  ReceiptIcon,
  CreditCardIcon,
  WalletIcon,
  FolderIcon,
  ListChecksIcon,
  ShoppingBagIcon,
  Building2Icon,
  ClipboardListIcon,
  MessageSquareIcon,
  Settings2Icon,
  CircleHelpIcon,
  SearchIcon,
  BookOpenIcon,
  FileChartColumnIcon,
  FileIcon,
} from "lucide-react";

import { NavItems } from "@/components/nav-documents";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    { title: "Dashboard", url: "/admin/dashboard", icon: <LayoutDashboardIcon /> },
    { title: "Inbox", url: "/admin/inbox", icon: <MessageSquareIcon /> },
  ],
  sales: [
    { name: "Leads", url: "/admin/leads", icon: <UserRoundIcon /> },
    { name: "Clients", url: "/admin/clients", icon: <UsersIcon /> },
    { name: "Quotations", url: "/admin/quotations", icon: <FileTextIcon /> },
    { name: "Customer care", url: "/admin/customer-care", icon: <HeadsetIcon /> },
  ],
  finance: [
    { name: "Invoices", url: "/admin/invoices", icon: <ReceiptIcon /> },
    { name: "Payments", url: "/admin/payments", icon: <CreditCardIcon /> },
    { name: "Expenses", url: "/admin/expenses", icon: <WalletIcon /> },
  ],
  operations: [
    { name: "Projects", url: "/admin/projects", icon: <FolderIcon /> },
    { name: "Tasks", url: "/admin/tasks", icon: <ListChecksIcon /> },
    {
      name: "Design Orders",
      url: "/admin/design-purchases",
      icon: <ShoppingBagIcon />,
    },
    { name: "Properties", url: "/admin/properties", icon: <Building2Icon /> },
    { name: "Services", url: "/admin/services", icon: <ClipboardListIcon /> },
    { name: "Team", url: "/admin/team", icon: <UsersIcon /> },
  ],
  navSecondary: [
    { title: "Settings", url: "/admin/settings", icon: <Settings2Icon /> },
    { title: "Get Help", url: "/admin/help", icon: <CircleHelpIcon /> },
    { title: "Search", url: "/admin/search", icon: <SearchIcon /> },
  ],
  documents: [
    { name: "Documents", url: "/admin/documents", icon: <FileIcon /> },
    { name: "Reports", url: "/admin/reports", icon: <FileChartColumnIcon /> },
    {
      name: "Knowledge Base",
      url: "/admin/knowledge-base",
      icon: <BookOpenIcon />,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="data-[slot=sidebar-menu-button]:p-1.5!">
              <div>
                {/* Expanded State Logos */}
                <div className="group-data-[collapsible=icon]:hidden">
                  <Image
                    src="/calacot-logo-vertical-white.svg"
                    width={140}
                    height={60}
                    alt="Calacot Logo"
                    className="object-contain hidden dark:block"
                  />
                  <Image
                    src="/calacot-logo-vertical-black.svg"
                    width={140}
                    height={60}
                    alt="Calacot Logo"
                    className="object-contain block dark:hidden"
                  />
                </div>

                {/* Collapsed State Logo Icon */}
                <div className="hidden group-data-[collapsible=icon]:block">
                  <Image
                    src="/calacot-logo-icon-white.svg"
                    width={40}
                    height={40}
                    alt="Calacot Logo"
                    className="object-contain hidden dark:block"
                  />
                  <Image
                    src="/calacot-logo-icon-black.svg"
                    width={40}
                    height={40}
                    alt="Calacot Logo"
                    className="object-contain block dark:hidden"
                  />
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavItems title="Sales & Clients" items={data.sales} />
        <NavItems title="Finance" items={data.finance} />
        <NavItems title="Operations" items={data.operations} />
        <NavItems title="Documents" items={data.documents} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
