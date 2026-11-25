import { sql } from "drizzle-orm";
import { check, index, integer, unique, uniqueIndex, pgTable, text, uuid } from "drizzle-orm/pg-core";
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
import { projectMembers, projects } from "./projects";
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

// "returned" = returned to the requester for correction (Phase 1D). Disbursed and
// reconciled amounts come from expense_disbursements; approval never disburses money.
export const expenseStatusValues = [
  "draft",
  "submitted",
  "returned",
  "approved",
  "paid",
  "rejected",
  "void",
] as const;

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
      enum: expenseStatusValues,
    })
      .notNull()
      .default("draft"),
    incurredAt: instant("incurred_at").notNull(),
    approvedById: uuid("approved_by_id"),
    approvedAt: instant("approved_at"),
    paidAt: instant("paid_at"),
    paymentReference: text("payment_reference"),
    supplierInvoiceReference: text("supplier_invoice_reference"),
    // Phase 1D request workflow. Nullable for legacy rows created before requester tracking.
    purpose: text("purpose"),
    requestedById: uuid("requested_by_id"),
    submittedAt: instant("submitted_at"),
    reviewedById: uuid("reviewed_by_id"),
    reviewedAt: instant("reviewed_at"),
    reviewNote: text("review_note"),
    version: integer("version").notNull().default(1),
    idempotencyKey: text("idempotency_key"),
    // "admin_verified": recorded and approved by an administrator without a second reviewer (0027).
    entryMode: text("entry_mode", { enum: ["request", "admin_verified"] }).notNull().default("request"),
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
    allowed("expenses_status_check", t.status, expenseStatusValues),
    unique("expenses_org_id_currency_uq").on(t.organizationId, t.id, t.currency),
    scopedForeignKey(
      "expenses_requestedById_fk",
      t.organizationId,
      t.requestedById,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    scopedForeignKey(
      "expenses_reviewedById_fk",
      t.organizationId,
      t.reviewedById,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    check(
      "expenses_no_self_approval_check",
      sql`${t.entryMode} = 'admin_verified' or ${t.approvedById} is null or ${t.requestedById} is null or ${t.approvedById} <> ${t.requestedById}`,
    ),
    check("expenses_entry_mode_check", sql`${t.entryMode} in ('request', 'admin_verified')`),
    check(
      "expenses_returned_check",
      sql`${t.status} <> 'returned' or (${t.reviewedById} is not null and ${t.reviewedAt} is not null and nullif(trim(${t.reviewNote}), '') is not null)`,
    ),
    check("expenses_version_check", sql`${t.version} > 0`),
    uniqueIndex("expenses_idempotency_uq")
      .on(t.organizationId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index("expenses_requester_status_idx").on(
      t.organizationId,
      t.requestedById,
      t.status,
    ),
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

// Per-person breakdown of a project expense (migration 0026). Lines add up to the expense
// total and are replaced only by expense_save_with_payees while the expense is editable.
// A line counts as paid once its expense is paid in full.
export const expensePayees = pgTable(
  "expense_payees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    expenseId: uuid("expense_id").notNull(),
    projectMemberId: uuid("project_member_id").notNull(),
    amount: money("amount").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("expense_payees_org_id_uq").on(t.organizationId, t.id),
    unique("expense_payees_member_uq").on(t.organizationId, t.expenseId, t.projectMemberId),
    scopedForeignKey("expense_payees_expense_fk", t.organizationId, t.expenseId, expenses.organizationId, expenses.id),
    scopedForeignKey("expense_payees_member_fk", t.organizationId, t.projectMemberId, projectMembers.organizationId, projectMembers.id),
    check("expense_payees_amount_check", sql`${t.amount} > 0`),
    index("expense_payees_member_idx").on(t.organizationId, t.projectMemberId),
  ],
);
export type ExpensePayeesRecord = typeof expensePayees.$inferSelect;
