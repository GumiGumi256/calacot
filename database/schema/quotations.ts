import { sql } from "drizzle-orm";
import {
  check,
  uniqueIndex,
  integer,
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
  divisions,
  instant,
  money,
  timestamps,
  scopedForeignKey,
} from "./common";
import { organizations } from "./organization";
import { clients } from "./clients";
import { opportunities } from "./opportunities";
import { services } from "./services";

export const quotations = pgTable(
  "quotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    clientId: uuid("client_id").notNull(),
    opportunityId: uuid("opportunity_id"),
    number: text("number"), // Assigned once before sending.
    title: text("title").notNull(),
    division: text("division", { enum: divisions }).notNull(),
    archivedAt: instant("archived_at"),
    ...timestamps(),
  },
  (t) => [
    unique("quotations_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "quotations_clientId_fk",
      t.organizationId,
      t.clientId,
      clients.organizationId,
      clients.id,
    ),
    scopedForeignKey(
      "quotations_opportunityId_fk",
      t.organizationId,
      t.opportunityId,
      opportunities.organizationId,
      opportunities.id,
    ),
    allowed("quotations_division_check", t.division, divisions),
    unique("quotations_number_org_uq").on(t.organizationId, t.number),
    index("quotations_client_idx").on(t.organizationId, t.clientId),
  ],
);
export type QuotationsRecord = typeof quotations.$inferSelect;

export const quotationVersions = pgTable(
  "quotation_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    quotationId: uuid("quotation_id").notNull(),
    version: integer("version").notNull(),
    status: text("status", {
      enum: ["draft", "sent", "accepted", "declined", "expired", "superseded"],
    })
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
    scope: text("scope").notNull(),
    deliverables: jsonb("deliverables")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    exclusions: jsonb("exclusions")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    terms: text("terms").notNull(),
    currency: text("currency", { enum: currencies }).notNull().default("UGX"),
    subtotal: money("subtotal").notNull().default("0"),
    discountAmount: money("discount_amount").notNull().default("0"),
    taxAmount: money("tax_amount").notNull().default("0"),
    total: money("total").notNull().default("0"),
    validUntil: instant("valid_until"),
    sentAt: instant("sent_at"),
    acceptedAt: instant("accepted_at"),
    acceptedByName: text("accepted_by_name"),
    declinedAt: instant("declined_at"),
    ...timestamps(),
  },
  (t) => [
    unique("quotation_versions_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "quotation_versions_quotationId_fk",
      t.organizationId,
      t.quotationId,
      quotations.organizationId,
      quotations.id,
    ),
    allowed("quotation_versions_status_check", t.status, [
      "draft",
      "sent",
      "accepted",
      "declined",
      "expired",
      "superseded",
    ]),
    allowed("quotation_versions_currency_check", t.currency, currencies),
    check("quotation_versions_revision_check", sql`${t.version} > 0`),
    check(
      "quotation_versions_amounts_check",
      sql`${t.subtotal} >= 0 and ${t.discountAmount} >= 0 and ${t.discountAmount} <= ${t.subtotal} and ${t.taxAmount} >= 0 and ${t.total} = ${t.subtotal} - ${t.discountAmount} + ${t.taxAmount}`,
    ),
    check(
      "quotation_versions_sent_check",
      sql`${t.status} = 'draft' or ${t.sentAt} is not null`,
    ),
    check(
      "quotation_versions_accepted_check",
      sql`${t.status} <> 'accepted' or (${t.acceptedAt} is not null and nullif(trim(${t.acceptedByName}), '') is not null)`,
    ),
    check(
      "quotation_versions_arrays_check",
      sql`jsonb_typeof(${t.deliverables}) = 'array' and jsonb_typeof(${t.exclusions}) = 'array'`,
    ),
    unique("quotation_versions_revision_uq").on(
      t.organizationId,
      t.quotationId,
      t.version,
    ),
    index("quotation_versions_status_idx").on(t.organizationId, t.status),
    uniqueIndex("quotation_versions_accepted_uq")
      .on(t.organizationId, t.quotationId)
      .where(sql`${t.status} = 'accepted'`),
  ],
);
export type QuotationVersionsRecord = typeof quotationVersions.$inferSelect;

export const quotationItems = pgTable(
  "quotation_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    quotationVersionId: uuid("quotation_version_id").notNull(),
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
    unique("quotation_items_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "quotation_items_quotationVersionId_fk",
      t.organizationId,
      t.quotationVersionId,
      quotationVersions.organizationId,
      quotationVersions.id,
    ),
    scopedForeignKey(
      "quotation_items_serviceId_fk",
      t.organizationId,
      t.serviceId,
      services.organizationId,
      services.id,
    ),
    check(
      "quotation_items_values_check",
      sql`${t.position} >= 0 and ${t.quantity} > 0 and ${t.unitPrice} >= 0 and ${t.discountAmount} >= 0 and ${t.taxRate} between 0 and 100 and ${t.taxAmount} >= 0`,
    ),
    check(
      "quotation_items_math_check",
      sql`${t.subtotal} = round(${t.quantity} * ${t.unitPrice}, 2) and ${t.discountAmount} <= ${t.subtotal} and ${t.taxAmount} = round((${t.subtotal} - ${t.discountAmount}) * ${t.taxRate} / 100, 2) and ${t.total} = ${t.subtotal} - ${t.discountAmount} + ${t.taxAmount}`,
    ),
    unique("quotation_items_position_uq").on(
      t.organizationId,
      t.quotationVersionId,
      t.position,
    ),
  ],
);
export type QuotationItemsRecord = typeof quotationItems.$inferSelect;

export const quotationPaymentSchedules = pgTable(
  "quotation_payment_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    quotationVersionId: uuid("quotation_version_id").notNull(),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    amount: money("amount").notNull(),
    dueAt: instant("due_at"),
    trigger: text("trigger"),
  },
  (t) => [
    unique("quotation_payment_schedules_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "quotation_payment_schedules_quotationVersionId_fk",
      t.organizationId,
      t.quotationVersionId,
      quotationVersions.organizationId,
      quotationVersions.id,
    ),
    check(
      "quotation_payment_schedules_amount_check",
      sql`${t.amount} > 0 and ${t.position} >= 0`,
    ),
    unique("quotation_payment_schedules_position_uq").on(
      t.organizationId,
      t.quotationVersionId,
      t.position,
    ),
  ],
);
export type QuotationPaymentSchedulesRecord =
  typeof quotationPaymentSchedules.$inferSelect;
