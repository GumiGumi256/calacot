import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { allowed, currencies, instant, money, scopedForeignKey } from "./common";
import { organizations, staffMemberships } from "./organization";
import { expenses } from "./expenses";
import { documents } from "./documents";

export const disbursementMethods = [
  "bank_transfer",
  "mobile_money",
  "cash",
  "cheque",
  "other",
] as const;

// Methods whose transaction references are only unique within a provider account.
export const accountMethods = ["bank_transfer", "mobile_money", "cheque"] as const;

// Company source accounts used to pay expenses (bank accounts, mobile-money wallets,
// cheque books). Registered and verified by an authorized manager; identity fields are
// immutable (trigger). Disbursement references are unique per account (approved policy).
export const financeAccounts = pgTable(
  "finance_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    method: text("method", { enum: accountMethods }).notNull(),
    provider: text("provider").notNull(),
    accountIdentifier: text("account_identifier").notNull(),
    providerNormalized: text("provider_normalized").generatedAlwaysAs(
      sql`upper(regexp_replace(provider, '[^A-Za-z0-9]', '', 'g'))`,
    ),
    accountNormalized: text("account_normalized").generatedAlwaysAs(
      sql`upper(regexp_replace(account_identifier, '[^A-Za-z0-9]', '', 'g'))`,
    ),
    label: text("label").notNull(),
    currency: text("currency", { enum: currencies }).notNull(),
    status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
    verifiedById: uuid("verified_by_id").notNull(),
    verifiedAt: instant("verified_at").notNull(),
    verificationNote: text("verification_note").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("finance_accounts_org_id_uq").on(t.organizationId, t.id),
    unique("finance_accounts_org_id_method_currency_uq").on(t.organizationId, t.id, t.method, t.currency),
    unique("finance_accounts_identity_uq").on(t.organizationId, t.method, t.providerNormalized, t.accountNormalized),
    unique("finance_accounts_idempotency_uq").on(t.organizationId, t.idempotencyKey),
    scopedForeignKey("finance_accounts_verified_fk", t.organizationId, t.verifiedById, staffMemberships.organizationId, staffMemberships.id),
    allowed("finance_accounts_method_check", t.method, accountMethods),
    allowed("finance_accounts_currency_check", t.currency, currencies),
    allowed("finance_accounts_status_check", t.status, ["active", "inactive"]),
    check(
      "finance_accounts_identity_check",
      sql`${t.providerNormalized} <> '' and ${t.accountNormalized} <> '' and length(${t.provider}) <= 100 and length(${t.accountIdentifier}) <= 100 and length(trim(${t.label})) between 1 and 120 and length(trim(${t.verificationNote})) >= 5`,
    ),
  ],
);
export type FinanceAccountsRecord = typeof financeAccounts.$inferSelect;

// Manually recorded outgoing payment against an approved expense. This is an
// internal record, not an externally verified bank settlement. Rows are append-only
// apart from one-time void or reconciliation fields (enforced by trigger).
export const expenseDisbursements = pgTable(
  "expense_disbursements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    expenseId: uuid("expense_id").notNull(),
    amount: money("amount").notNull(),
    currency: text("currency", { enum: currencies }).notNull(),
    method: text("method", { enum: disbursementMethods }).notNull(),
    reference: text("reference"),
    referenceNormalized: text("reference_normalized").generatedAlwaysAs(
      sql`nullif(upper(regexp_replace(coalesce(reference, ''), '[^A-Za-z0-9]', '', 'g')), '')`,
    ),
    // Phase 1D policy: required for bank transfer, mobile money and cheque.
    sourceAccountId: uuid("source_account_id"),
    paidOn: date("paid_on").notNull(),
    responsibleStaffId: uuid("responsible_staff_id").notNull(),
    recordedById: uuid("recorded_by_id").notNull(),
    evidenceDocumentId: uuid("evidence_document_id"),
    notes: text("notes"),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", { enum: ["recorded", "void"] })
      .notNull()
      .default("recorded"),
    voidedAt: instant("voided_at"),
    voidedById: uuid("voided_by_id"),
    voidReason: text("void_reason"),
    reconciledAt: instant("reconciled_at"),
    reconciledById: uuid("reconciled_by_id"),
    reconciliationReference: text("reconciliation_reference"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("expense_disbursements_org_id_uq").on(t.organizationId, t.id),
    foreignKey({
      name: "expense_disbursements_expense_currency_fk",
      columns: [t.organizationId, t.expenseId, t.currency],
      foreignColumns: [expenses.organizationId, expenses.id, expenses.currency],
    }).onDelete("restrict"),
    scopedForeignKey("expense_disbursements_responsible_fk", t.organizationId, t.responsibleStaffId, staffMemberships.organizationId, staffMemberships.id),
    scopedForeignKey("expense_disbursements_recorded_fk", t.organizationId, t.recordedById, staffMemberships.organizationId, staffMemberships.id),
    scopedForeignKey("expense_disbursements_voided_fk", t.organizationId, t.voidedById, staffMemberships.organizationId, staffMemberships.id),
    scopedForeignKey("expense_disbursements_reconciled_fk", t.organizationId, t.reconciledById, staffMemberships.organizationId, staffMemberships.id),
    scopedForeignKey("expense_disbursements_evidence_fk", t.organizationId, t.evidenceDocumentId, documents.organizationId, documents.id),
    allowed("expense_disbursements_method_check", t.method, disbursementMethods),
    allowed("expense_disbursements_status_check", t.status, ["recorded", "void"]),
    allowed("expense_disbursements_currency_check", t.currency, currencies),
    check("expense_disbursements_amount_check", sql`${t.amount} > 0`),
    check(
      "expense_disbursements_reference_check",
      sql`${t.method} = 'cash' or ${t.referenceNormalized} is not null`,
    ),
    check(
      "expense_disbursements_void_check",
      sql`${t.status} <> 'void' or (${t.voidedAt} is not null and ${t.voidedById} is not null and nullif(trim(${t.voidReason}), '') is not null)`,
    ),
    check(
      "expense_disbursements_reconciled_check",
      sql`${t.reconciledAt} is null or (${t.status} = 'recorded' and ${t.reconciledById} is not null and nullif(trim(${t.reconciliationReference}), '') is not null)`,
    ),
    check(
      "expense_disbursements_segregation_check",
      sql`${t.reconciledById} is null or ${t.reconciledById} <> ${t.recordedById}`,
    ),
    unique("expense_disbursements_idempotency_uq").on(t.organizationId, t.idempotencyKey),
    foreignKey({
      name: "expense_disbursements_source_account_fk",
      columns: [t.organizationId, t.sourceAccountId, t.method, t.currency],
      foreignColumns: [financeAccounts.organizationId, financeAccounts.id, financeAccounts.method, financeAccounts.currency],
    }).onDelete("restrict"),
    check(
      "expense_disbursements_source_account_check",
      sql`(${t.method} in ('bank_transfer', 'mobile_money', 'cheque')) = (${t.sourceAccountId} is not null)`,
    ),
    // Approved duplicate policy: one active disbursement per organization, payment method,
    // verified source account (where applicable) and normalized transaction reference.
    // Voided rows release the reference. The unique index makes concurrent inserts safe.
    uniqueIndex("expense_disbursements_account_reference_uq")
      .on(t.organizationId, t.method, sql`coalesce(${t.sourceAccountId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.referenceNormalized)
      .where(sql`${t.status} = 'recorded' and ${t.referenceNormalized} is not null`),
    index("expense_disbursements_expense_idx").on(t.organizationId, t.expenseId),
    index("expense_disbursements_paid_idx").on(t.organizationId, t.paidOn),
  ],
);
export type ExpenseDisbursementsRecord = typeof expenseDisbursements.$inferSelect;

// Append-only financial history (UPDATE/DELETE blocked by trigger). Idempotency keys
// make retried commands return the original outcome instead of repeating it.
export const expenseEvents = pgTable(
  "expense_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    expenseId: uuid("expense_id").notNull(),
    disbursementId: uuid("disbursement_id"),
    actorClerkUserId: text("actor_clerk_user_id").notNull(),
    actorStaffId: uuid("actor_staff_id"),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    version: integer("version"),
    note: text("note"),
    changes: jsonb("changes").$type<Record<string, unknown>>().notNull().default({}),
    idempotencyKey: text("idempotency_key"),
    correlationId: text("correlation_id"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("expense_events_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey("expense_events_expense_fk", t.organizationId, t.expenseId, expenses.organizationId, expenses.id),
    scopedForeignKey("expense_events_disbursement_fk", t.organizationId, t.disbursementId, expenseDisbursements.organizationId, expenseDisbursements.id),
    scopedForeignKey("expense_events_actor_fk", t.organizationId, t.actorStaffId, staffMemberships.organizationId, staffMemberships.id),
    uniqueIndex("expense_events_idempotency_uq")
      .on(t.organizationId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index("expense_events_expense_idx").on(t.organizationId, t.expenseId, t.createdAt),
  ],
);
export type ExpenseEventsRecord = typeof expenseEvents.$inferSelect;
