// db/schema.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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