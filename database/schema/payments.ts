import { sql } from "drizzle-orm";
import {
  foreignKey,
  check,
  index,
  unique,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import {
  allowed,
  currencies,
  instant,
  money,
  timestamps,
  scopedForeignKey,
} from "./common";
import { organizations } from "./organization";
import { clients } from "./clients";
import { invoices, creditNotes } from "./invoices";
import { staffMemberships } from "./organization";

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    clientId: uuid("client_id").notNull(),
    amount: money("amount").notNull(),
    currency: text("currency", { enum: currencies }).notNull().default("UGX"),
    method: text("method", {
      enum: ["mobile_money", "bank_transfer", "cash", "other"],
    }).notNull(),
    status: text("status", { enum: ["submitted", "confirmed", "rejected"] })
      .notNull()
      .default("submitted"),
    provider: text("provider"),
    providerTransactionId: text("provider_transaction_id"),
    reference: text("reference"),
    idempotencyKey: text("idempotency_key").notNull(),
    receiptNumber: text("receipt_number"),
    receivedAt: instant("received_at").notNull(),
    confirmedAt: instant("confirmed_at"),
    confirmedById: uuid("confirmed_by_id"),
    rejectionReason: text("rejection_reason"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    unique("payments_org_id_uq").on(t.organizationId, t.id),
    unique("payments_org_client_currency_uq").on(
      t.organizationId,
      t.id,
      t.clientId,
      t.currency,
    ),
    scopedForeignKey(
      "payments_clientId_fk",
      t.organizationId,
      t.clientId,
      clients.organizationId,
      clients.id,
    ),
    scopedForeignKey(
      "payments_confirmedById_fk",
      t.organizationId,
      t.confirmedById,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    allowed("payments_method_check", t.method, [
      "mobile_money",
      "bank_transfer",
      "cash",
      "other",
    ]),
    allowed("payments_status_check", t.status, [
      "submitted",
      "confirmed",
      "rejected",
    ]),
    allowed("payments_currency_check", t.currency, currencies),
    check("payments_amount_check", sql`${t.amount} > 0`),
    check(
      "payments_confirmed_check",
      sql`${t.status} <> 'confirmed' or (${t.confirmedAt} is not null and ${t.confirmedById} is not null and ${t.receiptNumber} is not null)`,
    ),
    check(
      "payments_provider_reference_check",
      sql`${t.providerTransactionId} is null or ${t.provider} is not null`,
    ),
    unique("payments_idempotency_org_uq").on(
      t.organizationId,
      t.idempotencyKey,
    ),
    unique("payments_receipt_org_uq").on(t.organizationId, t.receiptNumber),
    unique("payments_provider_transaction_org_uq").on(
      t.organizationId,
      t.provider,
      t.providerTransactionId,
    ),
    index("payments_client_received_idx").on(
      t.organizationId,
      t.clientId,
      t.receivedAt,
    ),
  ],
);
export type PaymentsRecord = typeof payments.$inferSelect;

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    paymentId: uuid("payment_id").notNull(),
    clientId: uuid("client_id").notNull(),
    currency: text("currency", { enum: currencies }).notNull(),
    invoiceId: uuid("invoice_id").notNull(),
    amount: money("amount").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("payment_allocations_org_id_uq").on(t.organizationId, t.id),
    unique("payment_allocations_payment_id_uq").on(
      t.organizationId,
      t.id,
      t.paymentId,
    ),
    foreignKey({
      name: "payment_allocations_paymentId_client_currency_fk",
      columns: [t.organizationId, t.paymentId, t.clientId, t.currency],
      foreignColumns: [
        payments.organizationId,
        payments.id,
        payments.clientId,
        payments.currency,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "payment_allocations_invoiceId_client_currency_fk",
      columns: [t.organizationId, t.invoiceId, t.clientId, t.currency],
      foreignColumns: [
        invoices.organizationId,
        invoices.id,
        invoices.clientId,
        invoices.currency,
      ],
    }).onDelete("restrict"),
    check("payment_allocations_amount_check", sql`${t.amount} > 0`),
    unique("payment_allocations_invoice_payment_uq").on(
      t.organizationId,
      t.paymentId,
      t.invoiceId,
    ),
    index("payment_allocations_invoice_idx").on(t.organizationId, t.invoiceId),
  ],
);
export type PaymentAllocationsRecord = typeof paymentAllocations.$inferSelect;

export const paymentRefunds = pgTable(
  "payment_refunds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    paymentId: uuid("payment_id").notNull(),
    clientId: uuid("client_id").notNull(),
    currency: text("currency", { enum: currencies }).notNull(),
    creditNoteId: uuid("credit_note_id"),
    amount: money("amount").notNull(),
    status: text("status", { enum: ["pending", "completed", "cancelled"] })
      .notNull()
      .default("pending"),
    reason: text("reason").notNull(),
    reference: text("reference"),
    idempotencyKey: text("idempotency_key").notNull(),
    completedAt: instant("completed_at"),
    processedById: uuid("processed_by_id"),
    ...timestamps(),
  },
  (t) => [
    unique("payment_refunds_org_id_uq").on(t.organizationId, t.id),
    unique("payment_refunds_payment_id_uq").on(
      t.organizationId,
      t.id,
      t.paymentId,
    ),
    foreignKey({
      name: "payment_refunds_paymentId_client_currency_fk",
      columns: [t.organizationId, t.paymentId, t.clientId, t.currency],
      foreignColumns: [
        payments.organizationId,
        payments.id,
        payments.clientId,
        payments.currency,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "payment_refunds_creditNoteId_client_currency_fk",
      columns: [t.organizationId, t.creditNoteId, t.clientId, t.currency],
      foreignColumns: [
        creditNotes.organizationId,
        creditNotes.id,
        creditNotes.clientId,
        creditNotes.currency,
      ],
    }).onDelete("restrict"),
    scopedForeignKey(
      "payment_refunds_processedById_fk",
      t.organizationId,
      t.processedById,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    allowed("payment_refunds_status_check", t.status, [
      "pending",
      "completed",
      "cancelled",
    ]),
    check("payment_refunds_amount_check", sql`${t.amount} > 0`),
    check(
      "payment_refunds_completed_check",
      sql`${t.status} <> 'completed' or (${t.completedAt} is not null and ${t.processedById} is not null)`,
    ),
    unique("payment_refunds_idempotency_uq").on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index("payment_refunds_payment_idx").on(t.organizationId, t.paymentId),
  ],
);
export type PaymentRefundsRecord = typeof paymentRefunds.$inferSelect;

// Preserve the original allocation when money is returned. Balance queries subtract
// reversals linked to completed refunds; pending/cancelled refunds do not affect balances.
export const paymentAllocationReversals = pgTable(
  "payment_allocation_reversals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    paymentId: uuid("payment_id").notNull(),
    allocationId: uuid("allocation_id").notNull(),
    refundId: uuid("refund_id").notNull(),
    amount: money("amount").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("payment_allocation_reversals_org_id_uq").on(t.organizationId, t.id),
    foreignKey({
      name: "payment_allocation_reversals_allocation_payment_fk",
      columns: [t.organizationId, t.allocationId, t.paymentId],
      foreignColumns: [
        paymentAllocations.organizationId,
        paymentAllocations.id,
        paymentAllocations.paymentId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "payment_allocation_reversals_refund_payment_fk",
      columns: [t.organizationId, t.refundId, t.paymentId],
      foreignColumns: [
        paymentRefunds.organizationId,
        paymentRefunds.id,
        paymentRefunds.paymentId,
      ],
    }).onDelete("restrict"),
    check("payment_allocation_reversals_amount_check", sql`${t.amount} > 0`),
    unique("payment_allocation_reversals_refund_allocation_uq").on(
      t.organizationId,
      t.refundId,
      t.allocationId,
    ),
    index("payment_allocation_reversals_allocation_idx").on(
      t.organizationId,
      t.allocationId,
    ),
  ],
);
export type PaymentAllocationReversalRecord =
  typeof paymentAllocationReversals.$inferSelect;
