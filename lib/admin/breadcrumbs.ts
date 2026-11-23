import { navigation } from "@/lib/admin/navigation";

/** Singular names for detail pages, e.g. /admin/quotations/<id> -> "Quotation". */
const detailLabels: Record<string, string> = {
  quotations: "Quotation",
  invoices: "Invoice",
  clients: "Client",
  projects: "Project",
  expenses: "Expense request",
  documents: "Document",
  staff: "Staff member",
  deliveries: "Delivery",
  "design-purchases": "Design order",
  payments: "Payment",
};
const actionLabels: Record<string, string> = {
  new: "New", edit: "Edit", knowledge: "Knowledge",
  accounts: "Chart of accounts", journals: "Journals", periods: "Periods", "trial-balance": "Trial balance", policy: "Policy and rates",
  integration: "Integration", mappings: "Event mappings", reconciliation: "Reconciliation",
  banking: "Banking & cash", setup: "Accounts and mappings", import: "Import statement", cash: "Cash", reports: "Reports",
  tax: "Tax management", income: "Income tax", obligations: "Obligations", payments: "Payments & filings", settings: "Tax settings", assets: "Fixed assets", depreciation: "Depreciation", disposals: "Transfers & disposals", payroll: "Payroll",
  ledger: "General ledger", statements: "Financial statements", closing: "Period closing", adjustments: "Adjustments", classification: "Statement settings", migration: "Opening balances",
};
/** Third-level detail pages, e.g. /admin/accounting/journals/<id> -> "Journal". */
const nestedDetailLabels: Record<string, string> = { journals: "Journal", accounts: "Account", integration: "Accounting event", banking: "Banking account", reconciliation: "Reconciliation period", assets: "Asset", income: "Computation", statements: "Statement set", closing: "Period close", migration: "Migration batch" };

export type Crumb = { label: string; href: string };

const humanize = (segment: string) => {
  const text = decodeURIComponent(segment).replaceAll("-", " ");
  return text[0].toUpperCase() + text.slice(1);
};

/**
 * Breadcrumbs derived from the admin URL. Works for legacy (/admin/...) and organization-scoped
 * (/<org>/admin/...) paths and keeps the prefix on every link, so the proxy never has to redirect.
 * Pure: no permissions or data are read; labels come from the navigation definition.
 */
export function adminBreadcrumbs(pathname: string): Crumb[] {
  const match = /^((?:\/[^/]+)?)\/admin(?:\/(.*))?$/.exec(pathname.replace(/\/+$/, ""));
  if (!match) return [];
  const prefix = match[1] ?? "";
  const segments = (match[2] ?? "").split("/").filter(Boolean);
  if (!segments.length) return [];
  const crumbs: Crumb[] = [];
  let path = `${prefix}/admin`;
  segments.forEach((segment, index) => {
    path += `/${segment}`;
    if (index === 0) {
      const item = navigation.find((n) => n.url === `/admin/${segment}`);
      crumbs.push({ label: item?.name ?? humanize(segment), href: path });
      return;
    }
    const label = actionLabels[segment]
      ?? (index === 1 ? detailLabels[segments[0]] ?? "Details" : index === 2 && nestedDetailLabels[segments[1]] ? nestedDetailLabels[segments[1]] : humanize(segment));
    crumbs.push({ label, href: path });
  });
  return crumbs;
}

/** True when `href` is the current section or one of its descendants. */
export function isActivePath(pathname: string, href: string) {
  const clean = pathname.replace(/\/+$/, "");
  return clean === href || clean.startsWith(`${href}/`);
}
