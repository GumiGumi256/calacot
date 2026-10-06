import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import { organizations } from "./organization";
import { documents } from "./documents";
import { instant, timestamps, scopedForeignKey } from "./common";
export const deliveryIntents = pgTable(
  "delivery_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    channel: text("channel").notNull(),
    recipient: text("recipient").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("queued"),
    providerId: text("provider_id"),
    documentId: uuid("document_id"),
    firstAttemptAt: instant("first_attempt_at"),
    submittedAt: instant("submitted_at"),
    deliveredAt: instant("delivered_at"),
    complainedAt: instant("complained_at"),
    bouncedAt: instant("bounced_at"),
    errorCode: text("error_code"),
    correlationId: text("correlation_id").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("delivery_intents_org_id_uq").on(t.organizationId, t.id),
    unique("delivery_provider_uq").on(t.channel, t.providerId),
    scopedForeignKey(
      "delivery_document_fk",
      t.organizationId,
      t.documentId,
      documents.organizationId,
      documents.id,
    ),
    index("delivery_entity_idx").on(t.organizationId, t.entityType, t.entityId),
    check("delivery_channel_check", sql`${t.channel} in ('email','whatsapp')`),
  ],
);
export const deliveryAttempts = pgTable(
  "delivery_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    intentId: uuid("intent_id").notNull(),
    attempt: integer("attempt").notNull(),
    state: text("state").notNull(),
    code: text("code"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    scopedForeignKey(
      "delivery_attempt_intent_fk",
      t.organizationId,
      t.intentId,
      deliveryIntents.organizationId,
      deliveryIntents.id,
    ),
  ],
);
export const webhookInbox = pgTable("sales_webhook_inbox", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: instant("created_at").notNull().defaultNow(),
  processedAt: instant("processed_at"),
});
export const salesRateLimits = pgTable("sales_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: instant("expires_at").notNull(),
});
