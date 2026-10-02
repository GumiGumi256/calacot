import { sql } from "drizzle-orm";
import {
  check,
  integer,
  index,
  unique,
  pgTable,
  text,
  uuid,
  jsonb,
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
import { staffMemberships } from "./organization";

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    clientId: uuid("client_id"),
    ownerId: uuid("owner_id"),
    title: text("title").notNull(),
    division: text("division", { enum: divisions }).notNull(),
    stage: text("stage", {
      enum: [
        "new",
        "contacted",
        "qualified",
        "quotation_sent",
        "negotiating",
        "won",
        "lost",
      ],
    })
      .notNull()
      .default("new"),
    source: text("source", {
      enum: [
        "website",
        "whatsapp",
        "email",
        "referral",
        "advertisement",
        "manual",
      ],
    })
      .notNull()
      .default("manual"),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    estimatedValue: money("estimated_value"),
    currency: text("currency", { enum: currencies }).notNull().default("UGX"),
    probabilityPercent: integer("probability_percent"),
    requirements: jsonb("requirements").$type<Record<string, unknown>>(),
    nextFollowUpAt: instant("next_follow_up_at"),
    expectedCloseAt: instant("expected_close_at"),
    closedAt: instant("closed_at"),
    lostReason: text("lost_reason"),
    archivedAt: instant("archived_at"),
    ...timestamps(),
  },
  (t) => [
    unique("opportunities_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "opportunities_clientId_fk",
      t.organizationId,
      t.clientId,
      clients.organizationId,
      clients.id,
    ),
    scopedForeignKey(
      "opportunities_ownerId_fk",
      t.organizationId,
      t.ownerId,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    allowed("opportunities_stage_check", t.stage, [
      "new",
      "contacted",
      "qualified",
      "quotation_sent",
      "negotiating",
      "won",
      "lost",
    ]),
    allowed("opportunities_source_check", t.source, [
      "website",
      "whatsapp",
      "email",
      "referral",
      "advertisement",
      "manual",
    ]),
    allowed("opportunities_division_check", t.division, divisions),
    allowed("opportunities_currency_check", t.currency, currencies),
    check(
      "opportunities_value_check",
      sql`${t.estimatedValue} is null or ${t.estimatedValue} >= 0`,
    ),
    check(
      "opportunities_probability_check",
      sql`${t.probabilityPercent} is null or ${t.probabilityPercent} between 0 and 100`,
    ),
    check(
      "opportunities_closed_check",
      sql`${t.stage} not in ('won', 'lost') or ${t.closedAt} is not null`,
    ),
    index("opportunities_pipeline_idx").on(
      t.organizationId,
      t.division,
      t.stage,
    ),
    index("opportunities_followup_idx").on(
      t.organizationId,
      t.ownerId,
      t.nextFollowUpAt,
    ),
  ],
);
export type OpportunitiesRecord = typeof opportunities.$inferSelect;

export const opportunityActivities = pgTable(
  "opportunity_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    opportunityId: uuid("opportunity_id").notNull(),
    actorId: uuid("actor_id"),
    type: text("type", {
      enum: ["note", "call", "email", "whatsapp", "meeting", "stage_change"],
    }).notNull(),
    body: text("body").notNull(),
    occurredAt: instant("occurred_at").notNull().defaultNow(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("opportunity_activities_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "opportunity_activities_opportunityId_fk",
      t.organizationId,
      t.opportunityId,
      opportunities.organizationId,
      opportunities.id,
    ),
    scopedForeignKey(
      "opportunity_activities_actorId_fk",
      t.organizationId,
      t.actorId,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    allowed("opportunity_activities_type_check", t.type, [
      "note",
      "call",
      "email",
      "whatsapp",
      "meeting",
      "stage_change",
    ]),
    index("opportunity_activities_timeline_idx").on(
      t.organizationId,
      t.opportunityId,
      t.occurredAt,
    ),
  ],
);
export type OpportunityActivitiesRecord =
  typeof opportunityActivities.$inferSelect;
