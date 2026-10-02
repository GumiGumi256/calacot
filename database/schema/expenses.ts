import { sql } from "drizzle-orm";
import { check, index, unique, pgTable, text, uuid } from "drizzle-orm/pg-core";
import {
  allowed,
  currencies,
  divisions,
  instant,
  money,
  timestamps,
  scopedForeignKey,
} from "./common";
import { organizations } from "./organization";
import { projects } from "./projects";
import { staffMemberships } from "./organization";

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    taxIdentifier: text("tax_identifier"),
    address: text("address"),
    archivedAt: instant("archived_at"),
    ...timestamps(),
  },
  (t) => [
    unique("suppliers_org_id_uq").on(t.organizationId, t.id),
    index("suppliers_org_name_idx").on(t.organizationId, t.name),
  ],
);
export type SuppliersRecord = typeof suppliers.$inferSelect;

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    supplierId: uuid("supplier_id"),
    projectId: uuid("project_id"),
    division: text("division", { enum: divisions }).notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    netAmount: money("net_amount").notNull(),
    taxAmount: money("tax_amount").notNull().default("0"),
    total: money("total").notNull(),
    currency: text("currency", { enum: currencies }).notNull().default("UGX"),
    status: text("status", {
      enum: ["draft", "submitted", "approved", "paid", "rejected", "void"],
    })
      .notNull()
      .default("draft"),
    incurredAt: instant("incurred_at").notNull(),
    approvedById: uuid("approved_by_id"),
    approvedAt: instant("approved_at"),
    paidAt: instant("paid_at"),
    paymentReference: text("payment_reference"),
    supplierInvoiceReference: text("supplier_invoice_reference"),
    ...timestamps(),
  },
  (t) => [
    unique("expenses_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "expenses_supplierId_fk",
      t.organizationId,
      t.supplierId,
      suppliers.organizationId,
      suppliers.id,
    ),
    scopedForeignKey(
      "expenses_projectId_fk",
      t.organizationId,
      t.projectId,
      projects.organizationId,
      projects.id,
    ),
    scopedForeignKey(
      "expenses_approvedById_fk",
      t.organizationId,
      t.approvedById,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    allowed("expenses_status_check", t.status, [
      "draft",
      "submitted",
      "approved",
      "paid",
      "rejected",
      "void",
    ]),
    allowed("expenses_division_check", t.division, divisions),
    allowed("expenses_currency_check", t.currency, currencies),
    check(
      "expenses_amounts_check",
      sql`${t.netAmount} >= 0 and ${t.taxAmount} >= 0 and ${t.total} > 0 and ${t.total} = ${t.netAmount} + ${t.taxAmount}`,
    ),
    check(
      "expenses_approval_check",
      sql`${t.status} not in ('approved', 'paid') or (${t.approvedById} is not null and ${t.approvedAt} is not null)`,
    ),
    check(
      "expenses_paid_check",
      sql`${t.status} <> 'paid' or ${t.paidAt} is not null`,
    ),
    index("expenses_division_incurred_idx").on(
      t.organizationId,
      t.division,
      t.incurredAt,
    ),
    index("expenses_project_idx").on(t.organizationId, t.projectId),
  ],
);
export type ExpensesRecord = typeof expenses.$inferSelect;
