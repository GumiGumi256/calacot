import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  index,
  unique,
  pgTable,
  text,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { allowed, currencies, divisions, money, timestamps } from "./common";
import { organizations } from "./organization";

export const services = pgTable(
  "services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    division: text("division", { enum: divisions }).notNull(),
    description: text("description"),
    unit: text("unit").notNull().default("item"),
    defaultUnitPrice: money("default_unit_price"),
    currency: text("currency", { enum: currencies }).notNull().default("UGX"),
    defaultTaxRate: money("default_tax_rate").notNull().default("0"),
    isActive: boolean("is_active").notNull().default(true),
    scopeTemplate: jsonb("scope_template").$type<{
      deliverables?: string[];
      exclusions?: string[];
    }>(),
    ...timestamps(),
  },
  (t) => [
    unique("services_org_id_uq").on(t.organizationId, t.id),
    allowed("services_division_check", t.division, divisions),
    allowed("services_currency_check", t.currency, currencies),
    check(
      "services_price_check",
      sql`${t.defaultUnitPrice} is null or ${t.defaultUnitPrice} >= 0`,
    ),
    check("services_tax_check", sql`${t.defaultTaxRate} between 0 and 100`),
    unique("services_code_org_uq").on(t.organizationId, t.code),
    index("services_org_division_idx").on(t.organizationId, t.division),
  ],
);
export type ServicesRecord = typeof services.$inferSelect;
