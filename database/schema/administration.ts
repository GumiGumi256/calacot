import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { allowed, instant } from "./common";
import { organizations } from "./organization";

// Svix delivery ids of processed Clerk webhooks. Duplicate deliveries are acknowledged
// without reprocessing; failed ones may be retried. Handlers re-read Clerk, so the order
// of events never decides the resulting state.
export const clerkWebhookEvents = pgTable(
  "clerk_webhook_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id"),
    eventType: text("event_type").notNull(),
    status: text("status", { enum: ["processing", "processed", "ignored", "failed"] }).notNull(),
    attempts: integer("attempts").notNull().default(1),
    errorCode: text("error_code"),
    receivedAt: instant("received_at").notNull().defaultNow(),
    processedAt: instant("processed_at"),
  },
  (t) => [
    allowed("clerk_webhook_events_status_check", t.status, ["processing", "processed", "ignored", "failed"]),
    index("clerk_webhook_events_received_idx").on(t.receivedAt),
  ],
);

// Short leases that serialize administrative membership changes made through this app
// (role change, removal, invitation) so last-administrator checks cannot interleave.
export const adminOperationLeases = pgTable(
  "admin_operation_leases",
  {
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    scope: text("scope").notNull(),
    holder: text("holder").notNull(),
    expiresAt: instant("expires_at").notNull(),
  },
  (t) => [unique("admin_operation_leases_pk").on(t.organizationId, t.scope)],
);

// Append-only company settings history. The effective settings are the highest approved
// version. Payment-instruction changes are proposed and need a different administrator's
// approval. Issued quotation/invoice snapshots are never touched.
export const companySettingsVersions = pgTable(
  "company_settings_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    version: integer("version").notNull(),
    baseVersion: integer("base_version").notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull(),
    changedSections: text("changed_sections").array().notNull(),
    status: text("status", { enum: ["approved", "proposed", "rejected", "superseded"] }).notNull(),
    note: text("note").notNull(),
    proposedBy: text("proposed_by").notNull(),
    proposedAt: instant("proposed_at").notNull().defaultNow(),
    decidedBy: text("decided_by"),
    decidedAt: instant("decided_at"),
    decisionNote: text("decision_note"),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (t) => [
    unique("company_settings_versions_org_version_uq").on(t.organizationId, t.version),
    unique("company_settings_versions_idempotency_uq").on(t.organizationId, t.idempotencyKey),
    uniqueIndex("company_settings_one_open_proposal_uq").on(t.organizationId).where(sql`${t.status} = 'proposed'`),
    allowed("company_settings_versions_status_check", t.status, ["approved", "proposed", "rejected", "superseded"]),
    check("company_settings_versions_version_check", sql`${t.version} > 0 and ${t.baseVersion} >= 0 and ${t.baseVersion} < ${t.version}`),
    check("company_settings_versions_note_check", sql`length(trim(${t.note})) >= 5`),
    check(
      "company_settings_versions_decision_check",
      sql`${t.status} = 'proposed' or (${t.decidedBy} is not null and ${t.decidedAt} is not null)`,
    ),
    check(
      "company_settings_versions_two_person_check",
      sql`${t.status} <> 'approved' or not ('payment' = any(${t.changedSections})) or ${t.decidedBy} <> ${t.proposedBy}`,
    ),
  ],
);
