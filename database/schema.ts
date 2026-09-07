// db/schema.ts
import { check, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // Distinguishes form origin
  type: text("type", { 
    enum: ["scheduled_call", "project_request", "contact_inquiry"] 
  }).notNull(),

  // Common Fields
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  service: text("service").notNull(),

  // Schedule-Call Specific
  preferredDate: timestamp("preferred_date"),
  preferredTime: text("preferred_time"),

  // Start-Project Specific (Optional so schedule-call can ignore them)
  projectLocation: text("project_location"),
  estimatedBudget: text("estimated_budget"),
  timeline: text("timeline"),
  projectOverview: text("project_overview"),

  // CRM Pipeline State
  status: text("status", { 
    enum: ["new", "contacted", "scheduled", "qualified", "closed_won", "closed_lost"] 
  }).notNull().default("new"),

  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const realEstateEnquiries = pgTable("real_estate_enquiries", {
  id: uuid("id").primaryKey(),
  payloadHash: text("payload_hash").notNull(),
  intent: text("intent", { enum: ["buy-home", "buy-land", "sell-property"] }).notNull(),
  propertyType: text("property_type").notNull(),
  location: text("location").notNull(),
  timeline: text("timeline").notNull(),
  currency: text("currency", { enum: ["UGX", "USD"] }).notNull(),
  budgetMin: numeric("budget_min", { precision: 17, scale: 2 }),
  budgetMax: numeric("budget_max", { precision: 17, scale: 2 }),
  askingPrice: numeric("asking_price", { precision: 17, scale: 2 }),
  relationship: text("relationship", { enum: ["owner", "representative"] }),
  notes: text("notes"),
  fullName: text("full_name").notNull(),
  contactMethod: text("contact_method", { enum: ["email", "phone", "whatsapp"] }).notNull(),
  email: text("email"),
  phone: text("phone"),
  status: text("status", { enum: ["new", "contacted", "closed"] }).default("new").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("estate_enquiries_status_created_idx").on(table.status, table.createdAt),
  check("estate_enquiries_intent_check", sql`${table.intent} in ('buy-home', 'buy-land', 'sell-property')`),
  check("estate_enquiries_currency_check", sql`${table.currency} in ('UGX', 'USD')`),
  check("estate_enquiries_contact_check", sql`${table.contactMethod} in ('email', 'phone', 'whatsapp')`),
  check("estate_enquiries_status_check", sql`${table.status} in ('new', 'contacted', 'closed')`),
  check("estate_enquiries_budget_check", sql`(${table.budgetMin} is null or ${table.budgetMin} > 0) and (${table.budgetMax} is null or ${table.budgetMax} > 0) and (${table.budgetMin} is null or ${table.budgetMax} is null or ${table.budgetMax} >= ${table.budgetMin})`),
  check("estate_enquiries_price_check", sql`${table.askingPrice} is null or ${table.askingPrice} > 0`),
  check("estate_enquiries_reachable_check", sql`(${table.contactMethod} = 'email' and nullif(${table.email}, '') is not null) or (${table.contactMethod} in ('phone', 'whatsapp') and nullif(${table.phone}, '') is not null)`),
  check("estate_enquiries_relationship_check", sql`${table.relationship} is null or ${table.relationship} in ('owner', 'representative')`),
  check("estate_enquiries_seller_check", sql`${table.intent} <> 'sell-property' or ${table.relationship} is not null`),
]);
