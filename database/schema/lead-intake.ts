import { date, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations, staffMemberships } from "./organization";

export type LeadQualification = {
  score: number;
  temperature: "hot" | "warm" | "cold";
  reasons: string[];
  qualifiedAt: string;
};

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").references(() => organizations.id),
  assignedStaffId: uuid("assigned_staff_id").references(() => staffMemberships.id),
  division: text("division"),
  followUpOn: date("follow_up_on"),
  followUpNotes: text("follow_up_notes"),

  // Distinguishes form origin

  type: text("type", {
    enum: ["scheduled_call", "project_request", "contact_inquiry"],
  }).notNull(),

  // Common Fields

  fullName: text("full_name").notNull(),

  // Optional: WhatsApp leads are identified by phone and may not share an email.
  email: text("email"),

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
    enum: [
      "new",
      "contacted",
      "scheduled",
      "qualified",
      "closed_won",
      "closed_lost",
    ],
  })
    .notNull()
    .default("new"),

  adminNotes: text("admin_notes"),

  // Where the lead came from, and the WhatsApp assistant's qualification (migration 0031).
  source: text("source", { enum: ["website", "whatsapp"] }).notNull().default("website"),
  qualification: jsonb("qualification").$type<LeadQualification>(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const leadActivity = pgTable("lead_activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  leadId: uuid("lead_id").notNull().references(() => leads.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  changes: jsonb("changes").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("lead_activity_lead_idx").on(table.organizationId, table.leadId, table.createdAt)]);
