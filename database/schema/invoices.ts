import { sql } from "drizzle-orm";
import {
  foreignKey,
  uniqueIndex,
  check,
  integer,
  date,
  index,
  unique,
  pgTable,
  text,
  uuid,
  jsonb,
  numeric,
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
import { quotationVersions } from "./quotations";
import { projects } from "./projects";
import { services } from "./services";
import type { DocumentSnapshot } from "../../lib/sales/document-model";

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    clientId: uuid("client_id").notNull(),
    projectId: uuid("project_id"),
    quotationVersionId: uuid("quotation_version_id"),
    billingPurpose: text("billing_purpose"),
    billingScheduleId: uuid("billing_schedule_id"),
    documentSnapshot: jsonb("document_snapshot").$type<DocumentSnapshot>(),
    number: text("number"), // Null for drafts; issue atomically with documentCounters.
    status: text("status", { enum: ["draft", "issued", "void"] })
      .notNull()
      .default("draft"),
    customerSnapshot: jsonb("customer_snapshot")
      .$type<{
        name: string;
        email?: string;
        address?: string;
        taxIdentifier?: string;
      }>()
      .notNull(),
    issuerSnapshot: jsonb("issuer_snapshot")
      .$type<{
        legalName: string;
        address?: string;
        email?: string;
        phone?: string;
        taxIdentifier?: string;
      }>()
      .notNull(),
    currency: text("currency", { enum: currencies }).notNull().default("UGX"),
    subtotal: money("subtotal").notNull().default("0"),
    discountAmount: money("discount_amount").notNull().default("0"),
    taxAmount: money("tax_amount").notNull().default("0"),
    total: money("total").notNull().default("0"),
    issuedAt: instant("issued_at"),
    dueOn: date("due_on"),
    notes: text("notes"),
    terms: text("terms"),
    voidedAt: instant("voided_at"),
    voidReason: text("void_reason"),
    ...timestamps(),
  },
  (t) => [
    unique("invoices_org_id_uq").on(t.organizationId, t.id),
    foreignKey({ name: "invoices_project_client_fk", columns: [t.organizationId, t.projectId, t.clientId], foreignColumns: [projects.organizationId, projects.id, projects.clientId] }).onDelete("restrict"),
    uniqueIndex("invoices_billing_purpose_uq").on(t.organizationId, t.quotationVersionId, t.billingPurpose).where(sql`${t.quotationVersionId} is not null and ${t.billingPurpose} is not null`),
    unique("invoices_org_client_currency_uq").on(
      t.organizationId,
      t.id,
      t.clientId,
      t.currency,
    ),
    scopedForeignKey(
      "invoices_clientId_fk",
      t.organizationId,
      t.clientId,
      clients.organizationId,
      clients.id,
    ),
    scopedForeignKey(
      "invoices_projectId_fk",
      t.organizationId,
      t.projectId,
      projects.organizationId,
      projects.id,
    ),
    scopedForeignKey(
      "invoices_quotationVersionId_fk",
      t.organizationId,
      t.quotationVersionId,
      quotationVersions.organizationId,
      quotationVersions.id,
    ),
    allowed("invoices_status_check", t.status, ["draft", "issued", "void"]),
    allowed("invoices_currency_check", t.currency, currencies),
    check(
      "invoices_amounts_check",
      sql`${t.subtotal} >= 0 and ${t.discountAmount} >= 0 and ${t.discountAmount} <= ${t.subtotal} and ${t.taxAmount} >= 0 and ${t.total} = ${t.subtotal} - ${t.discountAmount} + ${t.taxAmount}`,
    ),
    check(
      "invoices_issued_check",
      sql`${t.status} = 'draft' or (nullif(trim(${t.number}), '') is not null and ${t.issuedAt} is not null and ${t.total} > 0)`,
    ),
    check(
      "invoices_void_check",
      sql`${t.status} <> 'void' or (${t.voidedAt} is not null and nullif(trim(${t.voidReason}), '') is not null)`,
    ),
    unique("invoices_number_org_uq").on(t.organizationId, t.number),
    index("invoices_status_due_idx").on(t.organizationId, t.status, t.dueOn),
    index("invoices_client_idx").on(t.organizationId, t.clientId),
  ],
);
export type InvoicesRecord = typeof invoices.$inferSelect;

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    invoiceId: uuid("invoice_id").notNull(),
    serviceId: uuid("service_id"),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    unit: text("unit").notNull().default("item"),
    quantity: numeric("quantity", { precision: 17, scale: 4 })
      .notNull()
      .default("1"),
    unitPrice: money("unit_price").notNull(),
    discountAmount: money("discount_amount").notNull().default("0"),
    taxRate: money("tax_rate").notNull().default("0"),
    subtotal: money("subtotal").notNull(),
    taxAmount: money("tax_amount").notNull().default("0"),
    total: money("total").notNull(),
  },
  (t) => [
    unique("invoice_items_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "invoice_items_invoiceId_fk",
      t.organizationId,
      t.invoiceId,
      invoices.organizationId,
      invoices.id,
    ),
    scopedForeignKey(
      "invoice_items_serviceId_fk",
      t.organizationId,
      t.serviceId,
      services.organizationId,
      services.id,
    ),
    check(
      "invoice_items_values_check",
      sql`${t.position} >= 0 and ${t.quantity} > 0 and ${t.unitPrice} >= 0 and ${t.discountAmount} >= 0 and ${t.taxRate} between 0 and 100 and ${t.taxAmount} >= 0`,
    ),
    check(
      "invoice_items_math_check",
      sql`${t.subtotal} = round(${t.quantity} * ${t.unitPrice}, 2) and ${t.discountAmount} <= ${t.subtotal} and ${t.taxAmount} = round((${t.subtotal} - ${t.discountAmount}) * ${t.taxRate} / 100, 2) and ${t.total} = ${t.subtotal} - ${t.discountAmount} + ${t.taxAmount}`,
    ),
    unique("invoice_items_position_uq").on(
      t.organizationId,
      t.invoiceId,
      t.position,
    ),
  ],
);
export type InvoiceItemsRecord = typeof invoiceItems.$inferSelect;

export const creditNotes = pgTable(
  "credit_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    invoiceId: uuid("invoice_id").notNull(),
    clientId: uuid("client_id").notNull(),
    number: text("number"),
    status: text("status", { enum: ["draft", "issued", "void"] })
      .notNull()
      .default("draft"),
    reason: text("reason").notNull(),
    currency: text("currency", { enum: currencies }).notNull().default("UGX"),
    subtotal: money("subtotal").notNull().default("0"),
    discountAmount: money("discount_amount").notNull().default("0"),
    taxAmount: money("tax_amount").notNull().default("0"),
    total: money("total").notNull().default("0"),
    issuedAt: instant("issued_at"),
    voidedAt: instant("voided_at"),
    ...timestamps(),
  },
  (t) => [
    unique("credit_notes_org_id_uq").on(t.organizationId, t.id),
    unique("credit_notes_org_client_currency_uq").on(
      t.organizationId,
      t.id,
      t.clientId,
      t.currency,
    ),
    foreignKey({
      name: "credit_notes_invoice_client_currency_fk",
      columns: [t.organizationId, t.invoiceId, t.clientId, t.currency],
      foreignColumns: [
        invoices.organizationId,
        invoices.id,
        invoices.clientId,
        invoices.currency,
      ],
    }).onDelete("restrict"),
    allowed("credit_notes_status_check", t.status, ["draft", "issued", "void"]),
    allowed("credit_notes_currency_check", t.currency, currencies),
    check(
      "credit_notes_amounts_check",
      sql`${t.subtotal} >= 0 and ${t.discountAmount} between 0 and ${t.subtotal} and ${t.taxAmount} >= 0 and ${t.total} = ${t.subtotal} - ${t.discountAmount} + ${t.taxAmount}`,
    ),
    check(
      "credit_notes_issued_check",
      sql`${t.status} = 'draft' or (${t.number} is not null and ${t.issuedAt} is not null and ${t.total} > 0)`,
    ),
    check(
      "credit_notes_void_check",
      sql`${t.status} <> 'void' or ${t.voidedAt} is not null`,
    ),
    unique("credit_notes_number_org_uq").on(t.organizationId, t.number),
    index("credit_notes_invoice_idx").on(t.organizationId, t.invoiceId),
  ],
);
export type CreditNotesRecord = typeof creditNotes.$inferSelect;

export const creditNoteItems = pgTable(
  "credit_note_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    creditNoteId: uuid("credit_note_id").notNull(),
    serviceId: uuid("service_id"),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    unit: text("unit").notNull().default("item"),
    quantity: numeric("quantity", { precision: 17, scale: 4 })
      .notNull()
      .default("1"),
    unitPrice: money("unit_price").notNull(),
    discountAmount: money("discount_amount").notNull().default("0"),
    taxRate: money("tax_rate").notNull().default("0"),
    subtotal: money("subtotal").notNull(),
    taxAmount: money("tax_amount").notNull().default("0"),
    total: money("total").notNull(),
  },
  (t) => [
    unique("credit_note_items_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "credit_note_items_creditNoteId_fk",
      t.organizationId,
      t.creditNoteId,
      creditNotes.organizationId,
      creditNotes.id,
    ),
    scopedForeignKey(
      "credit_note_items_serviceId_fk",
      t.organizationId,
      t.serviceId,
      services.organizationId,
      services.id,
    ),
    check(
      "credit_note_items_values_check",
      sql`${t.position} >= 0 and ${t.quantity} > 0 and ${t.unitPrice} >= 0 and ${t.discountAmount} >= 0 and ${t.taxRate} between 0 and 100 and ${t.taxAmount} >= 0`,
    ),
    check(
      "credit_note_items_math_check",
      sql`${t.subtotal} = round(${t.quantity} * ${t.unitPrice}, 2) and ${t.discountAmount} <= ${t.subtotal} and ${t.taxAmount} = round((${t.subtotal} - ${t.discountAmount}) * ${t.taxRate} / 100, 2) and ${t.total} = ${t.subtotal} - ${t.discountAmount} + ${t.taxAmount}`,
    ),
    unique("credit_note_items_position_uq").on(
      t.organizationId,
      t.creditNoteId,
      t.position,
    ),
  ],
);
export type CreditNoteItemsRecord = typeof creditNoteItems.$inferSelect;
