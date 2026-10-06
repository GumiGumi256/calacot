import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  index,
  unique,
  uniqueIndex,
  pgTable,
  text,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { allowed, instant, timestamps, scopedForeignKey } from "./common";
import { organizations } from "./organization";

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    kind: text("kind", { enum: ["individual", "company"] })
      .notNull()
      .default("individual"),
    displayName: text("display_name").notNull(),
    legalName: text("legal_name"),
    tradingName: text("trading_name"),
    department: text("department", { enum: ["estates", "architecture", "painting", "interiors", "tech"] }),
    clerkUserId: text("clerk_user_id"), // Customer identity, never a staff-role grant.
    taxIdentifier: text("tax_identifier"),
    billingAddress: jsonb("billing_address").$type<{
      line1?: string;
      city?: string;
      country?: string;
    }>(),
    notes: text("notes"),
    archivedAt: instant("archived_at"),
    ...timestamps(),
  },
  (t) => [
    unique("clients_org_id_uq").on(t.organizationId, t.id),
    allowed("clients_kind_check", t.kind, ["individual", "company"]),
    allowed("clients_department_check", t.department, ["estates", "architecture", "painting", "interiors", "tech"]),
    index("clients_org_department_idx").on(t.organizationId, t.department),
    uniqueIndex("clients_clerk_org_uq")
      .on(t.organizationId, t.clerkUserId)
      .where(sql`${t.clerkUserId} is not null`),
    index("clients_org_name_idx").on(t.organizationId, t.displayName),
  ],
);
export type ClientsRecord = typeof clients.$inferSelect;

export const clientContacts = pgTable(
  "client_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    clientId: uuid("client_id").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"), // Normalize to international form in the service layer.
    jobTitle: text("job_title"),
    isPrimary: boolean("is_primary").notNull().default(false),
    whatsappConsentAt: instant("whatsapp_consent_at"),
    whatsappConsentSource: text("whatsapp_consent_source"),
    ...timestamps(),
  },
  (t) => [
    unique("client_contacts_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "client_contacts_clientId_fk",
      t.organizationId,
      t.clientId,
      clients.organizationId,
      clients.id,
    ),
    check(
      "client_contacts_reachable_check",
      sql`nullif(trim(${t.email}), '') is not null or nullif(trim(${t.phone}), '') is not null`,
    ),
    uniqueIndex("client_contacts_primary_uq")
      .on(t.organizationId, t.clientId)
      .where(sql`${t.isPrimary} = true`),
    index("client_contacts_client_idx").on(t.organizationId, t.clientId),
    index("client_contacts_phone_idx").on(t.organizationId, t.phone),
  ],
);
export type ClientContactsRecord = typeof clientContacts.$inferSelect;
