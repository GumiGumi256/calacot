import { sql } from "drizzle-orm";
import {
  check,
  integer,
  index,
  unique,
  pgTable,
  text,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";
import { allowed, instant, timestamps } from "./common";

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(), // Exact Clerk organization ID (org_...).
    name: text("name").notNull(),
    legalName: text("legal_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    taxIdentifier: text("tax_identifier"),
    billingAddress: text("billing_address"),
    ...timestamps(),
  },
  (t) => [],
);
export type OrganizationsRecord = typeof organizations.$inferSelect;

export const staffMemberships = pgTable(
  "staff_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    clerkUserId: text("clerk_user_id").notNull(),
    displayName: text("display_name"),
    email: text("email"),
    clerkRole: text("clerk_role"), // Mirror only; authorization uses verified Clerk membership.
    division: text("division"),
    status: text("status", { enum: ["active", "suspended", "removed"] })
      .notNull()
      .default("active"),
    lastSyncedAt: instant("last_synced_at"),
    // Phase 1E operational profile. Never used to grant access: Clerk membership is authoritative;
    // `suspended` only ever denies (checked in staffContext).
    jobTitle: text("job_title"),
    responsibilities: text("responsibilities"),
    profileVersion: integer("profile_version").notNull().default(1),
    suspendedAt: instant("suspended_at"),
    suspendedBy: text("suspended_by"),
    suspensionReason: text("suspension_reason"),
    // Administrator-controlled approval for Clerk `org:member` users (Staff/Employee role).
    // Only narrows access: unapproved members receive no permissions.
    employeeEligibility: text("employee_eligibility", { enum: ["pending", "approved", "revoked"] }).notNull().default("pending"),
    eligibilityDecidedBy: text("eligibility_decided_by"),
    eligibilityDecidedAt: instant("eligibility_decided_at"),
    ...timestamps(),
  },
  (t) => [
    unique("staff_memberships_org_id_uq").on(t.organizationId, t.id),
    check(
      "staff_memberships_suspension_check",
      sql`${t.status} <> 'suspended' or ${t.suspendedAt} is null or nullif(trim(${t.suspensionReason}), '') is not null`,
    ),
    check("staff_memberships_profile_version_check", sql`${t.profileVersion} > 0`),
    allowed("staff_memberships_eligibility_check", t.employeeEligibility, ["pending", "approved", "revoked"]),
    check(
      "staff_memberships_eligibility_decision_check",
      sql`${t.employeeEligibility} = 'pending' or (${t.eligibilityDecidedBy} is not null and ${t.eligibilityDecidedAt} is not null)`,
    ),
    allowed("staff_memberships_status_check", t.status, [
      "active",
      "suspended",
      "removed",
    ]),
    unique("staff_memberships_clerk_org_uq").on(
      t.organizationId,
      t.clerkUserId,
    ),
    index("staff_memberships_org_status_idx").on(t.organizationId, t.status),
  ],
);
export type StaffMembershipsRecord = typeof staffMemberships.$inferSelect;

export const documentCounters = pgTable(
  "document_counters",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    documentType: text("document_type", {
      enum: ["quotation", "invoice", "receipt", "credit_note", "project"],
    }).notNull(),
    period: text("period").notNull(), // e.g. 2026; do not use MAX(number) + 1.
    nextValue: integer("next_value").notNull().default(1),
    updatedAt: instant("updated_at").notNull().defaultNow(),
  },
  (t) => [
    allowed("document_counters_documentType_check", t.documentType, [
      "quotation",
      "invoice",
      "receipt",
      "credit_note",
      "project",
    ]),
    check("document_counters_positive_check", sql`${t.nextValue} > 0`),
    primaryKey({ columns: [t.organizationId, t.documentType, t.period] }),
  ],
);
export type DocumentCountersRecord = typeof documentCounters.$inferSelect;
