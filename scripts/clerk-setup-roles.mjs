// Creates the Calacot staff roles in a Clerk DEVELOPMENT instance (idempotent).
// Not run automatically. Usage: node scripts/clerk-setup-roles.mjs --confirm
// Refuses live (sk_live_) keys: production role changes need a separate approved change.
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import { createClerkClient } from "@clerk/backend";
const key = process.env.CLERK_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_")) throw Error("Refusing: only a development Clerk instance (sk_test_) is allowed");
if (!process.argv.includes("--confirm")) throw Error("Dry run only. Re-run with --confirm to create missing roles.");
const roles = [
  { key: "org:sales", name: "Sales", description: "Leads, clients, projects and quotations" },
  { key: "org:finance", name: "Finance", description: "Invoices, payments and expense finance" },
  { key: "org:project_manager", name: "Project manager", description: "Projects, tasks and milestones" },
  { key: "org:viewer", name: "Read-only", description: "Read access to sales and finance records" },
];
const clerk = createClerkClient({ secretKey: key });
const existing = new Set((await clerk.organizationRoles.getOrganizationRoleList({ limit: 100 })).data.map((r) => r.key));
for (const r of roles) {
  if (existing.has(r.key)) { console.log("exists", r.key); continue; }
  // No Clerk system permissions are needed: Calacot grants come from the role key (lib/sales/permissions.ts).
  await clerk.organizationRoles.createOrganizationRole({ key: r.key, name: r.name, description: r.description, includeInInitialRoleSet: true });
  console.log("created", r.key);
}
