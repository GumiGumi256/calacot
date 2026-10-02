import { sql } from "drizzle-orm";
import {
  check,
  integer,
  index,
  unique,
  pgTable,
  text,
  uuid,
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
import { opportunities } from "./opportunities";
import { staffMemberships } from "./organization";
import { invoices } from "./invoices";

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    ownerClientId: uuid("owner_client_id"),
    managerId: uuid("manager_id"),
    code: text("code").notNull(),
    title: text("title").notNull(),
    propertyType: text("property_type").notNull(),
    transactionType: text("transaction_type", { enum: ["sale", "rent"] })
      .notNull()
      .default("sale"),
    status: text("status", {
      enum: ["draft", "available", "reserved", "sold", "let", "withdrawn"],
    })
      .notNull()
      .default("draft"),
    location: text("location").notNull(),
    description: text("description"),
    askingPrice: money("asking_price"),
    currency: text("currency", { enum: currencies }).notNull().default("UGX"),
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    areaSquareMetres: numeric("area_square_metres", {
      precision: 17,
      scale: 2,
    }),
    sanityDocumentId: text("sanity_document_id"),
    verifiedAt: instant("verified_at"),
    verifiedById: uuid("verified_by_id"),
    archivedAt: instant("archived_at"),
    ...timestamps(),
  },
  (t) => [
    unique("properties_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "properties_ownerClientId_fk",
      t.organizationId,
      t.ownerClientId,
      clients.organizationId,
      clients.id,
    ),
    scopedForeignKey(
      "properties_managerId_fk",
      t.organizationId,
      t.managerId,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    scopedForeignKey(
      "properties_verifiedById_fk",
      t.organizationId,
      t.verifiedById,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    allowed("properties_transactionType_check", t.transactionType, [
      "sale",
      "rent",
    ]),
    allowed("properties_status_check", t.status, [
      "draft",
      "available",
      "reserved",
      "sold",
      "let",
      "withdrawn",
    ]),
    allowed("properties_currency_check", t.currency, currencies),
    check(
      "properties_dimensions_check",
      sql`(${t.bedrooms} is null or ${t.bedrooms} >= 0) and (${t.bathrooms} is null or ${t.bathrooms} >= 0) and (${t.areaSquareMetres} is null or ${t.areaSquareMetres} > 0)`,
    ),
    check(
      "properties_price_check",
      sql`${t.askingPrice} is null or ${t.askingPrice} > 0`,
    ),
    unique("properties_code_org_uq").on(t.organizationId, t.code),
    unique("properties_sanity_org_uq").on(t.organizationId, t.sanityDocumentId),
    index("properties_status_location_idx").on(
      t.organizationId,
      t.status,
      t.location,
    ),
  ],
);
export type PropertiesRecord = typeof properties.$inferSelect;

export const propertyViewings = pgTable(
  "property_viewings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    propertyId: uuid("property_id").notNull(),
    opportunityId: uuid("opportunity_id").notNull(),
    advisorId: uuid("advisor_id"),
    startsAt: instant("starts_at").notNull(),
    endsAt: instant("ends_at"),
    status: text("status", {
      enum: ["scheduled", "completed", "cancelled", "no_show"],
    })
      .notNull()
      .default("scheduled"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    unique("property_viewings_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "property_viewings_propertyId_fk",
      t.organizationId,
      t.propertyId,
      properties.organizationId,
      properties.id,
    ),
    scopedForeignKey(
      "property_viewings_opportunityId_fk",
      t.organizationId,
      t.opportunityId,
      opportunities.organizationId,
      opportunities.id,
    ),
    scopedForeignKey(
      "property_viewings_advisorId_fk",
      t.organizationId,
      t.advisorId,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    allowed("property_viewings_status_check", t.status, [
      "scheduled",
      "completed",
      "cancelled",
      "no_show",
    ]),
    check(
      "property_viewings_dates_check",
      sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`,
    ),
    index("property_viewings_schedule_idx").on(
      t.organizationId,
      t.advisorId,
      t.startsAt,
    ),
  ],
);
export type PropertyViewingsRecord = typeof propertyViewings.$inferSelect;

export const propertyCommissions = pgTable(
  "property_commissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    propertyId: uuid("property_id").notNull(),
    opportunityId: uuid("opportunity_id"),
    payerClientId: uuid("payer_client_id").notNull(),
    invoiceId: uuid("invoice_id"),
    agreementReference: text("agreement_reference").notNull(),
    agreementTerms: text("agreement_terms").notNull(),
    expectedAmount: money("expected_amount").notNull(),
    currency: text("currency", { enum: currencies }).notNull().default("UGX"),
    status: text("status", {
      enum: ["agreed", "earned", "invoiced", "cancelled"],
    })
      .notNull()
      .default("agreed"),
    earnedAt: instant("earned_at"),
    protectionExpiresAt: instant("protection_expires_at"),
    ...timestamps(),
  },
  (t) => [
    unique("property_commissions_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "property_commissions_propertyId_fk",
      t.organizationId,
      t.propertyId,
      properties.organizationId,
      properties.id,
    ),
    scopedForeignKey(
      "property_commissions_opportunityId_fk",
      t.organizationId,
      t.opportunityId,
      opportunities.organizationId,
      opportunities.id,
    ),
    scopedForeignKey(
      "property_commissions_payerClientId_fk",
      t.organizationId,
      t.payerClientId,
      clients.organizationId,
      clients.id,
    ),
    scopedForeignKey(
      "property_commissions_invoiceId_fk",
      t.organizationId,
      t.invoiceId,
      invoices.organizationId,
      invoices.id,
    ),
    allowed("property_commissions_status_check", t.status, [
      "agreed",
      "earned",
      "invoiced",
      "cancelled",
    ]),
    allowed("property_commissions_currency_check", t.currency, currencies),
    check("property_commissions_amount_check", sql`${t.expectedAmount} > 0`),
    check(
      "property_commissions_invoice_check",
      sql`${t.status} <> 'invoiced' or ${t.invoiceId} is not null`,
    ),
    index("property_commissions_status_idx").on(t.organizationId, t.status),
  ],
);
export type PropertyCommissionsRecord = typeof propertyCommissions.$inferSelect;
