// Client-safe catalog of the Calacot staff roles. Grants live in lib/sales/permissions.ts
// (roleAllows); this file only describes them. A role can be assigned only if it also exists
// in the Clerk instance (checked at assignment time).
export type StaffRole = { key: string; label: string; summary: string };
export const staffRoles: StaffRole[] = [
  { key: "org:admin", label: "Administrator", summary: "Full access, including staff, settings, customer care and payment accounts." },
  { key: "org:sales", label: "Sales", summary: "Leads, clients, projects and quotations. Can request expenses." },
  { key: "org:finance", label: "Finance", summary: "Invoices, payments, disbursement, reconciliation and reports. Accounting: view the ledger, propose accounts and policy, prepare and post approved journals; operate the accounting integration queue and propose event mappings. Cannot approve journals, close periods, manage staff, settings or payment accounts." },
  { key: "org:project_manager", label: "Project manager", summary: "Projects, tasks and milestones; read clients, quotations and leads. Can request expenses." },
  { key: "org:member", label: "Staff / employee", summary: "Can create and submit their own expense requests only." },
  { key: "org:viewer", label: "Read-only", summary: "Read access to sales, finance and accounting records. No changes." },
];
export const roleLabel = (key: string | null | undefined) => staffRoles.find((r) => r.key === key)?.label ?? (key ? key.replace(/^org:/, "") : "Unknown");
export const divisionsList = ["estates", "architecture", "painting", "interiors", "tech"] as const;
export const maskEmail = (email: string) => {
  const [user, domain] = email.split("@");
  return domain ? `${user.slice(0, 1)}***@${domain}` : "***";
};
