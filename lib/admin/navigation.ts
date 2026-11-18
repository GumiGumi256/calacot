import type { Permission } from "@/lib/sales/permissions";
// `permission` requires one grant; `anyPermission` shows the item when any listed grant is held.
export type NavigationItem = { name: string; url: string; group: "main" | "sales" | "finance" | "operations" | "administration"; permission?: Permission; anyPermission?: Permission[]; adminOnly?: boolean };
export const navigation: NavigationItem[] = [
  { name: "Dashboard", url: "/admin/dashboard", group: "main" },
  { name: "Leads", url: "/admin/leads", group: "sales", permission: "leads_read" },
  { name: "Clients", url: "/admin/clients", group: "sales", permission: "clients_read" },
  { name: "Quotations", url: "/admin/quotations", group: "sales", permission: "quotations_read" },
  { name: "Customer care", url: "/admin/customer-care", group: "sales", adminOnly: true },
  { name: "Invoices", url: "/admin/invoices", group: "finance", permission: "invoices_read" },
  { name: "Payments", url: "/admin/payments", group: "finance", permission: "payments_read" },
  { name: "Expenses", url: "/admin/expenses", group: "finance", anyPermission: ["expenses_read", "expenses_create"] },
  { name: "Financial reports", url: "/admin/financial-reports", group: "finance", permission: "finance_reports" },
  { name: "Payment accounts", url: "/admin/payment-accounts", group: "finance", permission: "finance_accounts_manage" },
  { name: "Projects", url: "/admin/projects", group: "operations", permission: "projects_read" },
  { name: "Tasks", url: "/admin/tasks", group: "operations", permission: "projects_read" },
  { name: "Design Orders", url: "/admin/design-purchases", group: "operations", adminOnly: true },
  { name: "Delivery operations", url: "/admin/deliveries", group: "operations", permission: "notifications_manage" },
  { name: "Staff", url: "/admin/staff", group: "administration", permission: "staff_manage" },
  { name: "Company settings", url: "/admin/settings", group: "administration", permission: "settings_manage" },
];
export function visibleNavigation(role: string, permissions: readonly Permission[]) {
  return navigation.filter(item =>
    (!item.adminOnly || role === "org:admin") &&
    (!item.permission || permissions.includes(item.permission)) &&
    (!item.anyPermission || item.anyPermission.some(p => permissions.includes(p))));
}
