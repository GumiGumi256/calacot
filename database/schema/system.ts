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
import { allowed, instant, timestamps } from "./common";
import { organizations } from "./organization";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorClerkUserId: text("actor_clerk_user_id"),
    actorType: text("actor_type", {
      enum: ["staff", "customer", "system"],
    }).notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    changes: jsonb("changes").$type<Record<string, unknown>>(), // Redacted changed fields, never tokens or whole inbound payloads.
    requestId: text("request_id"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("audit_logs_org_id_uq").on(t.organizationId, t.id),
    allowed("audit_logs_actorType_check", t.actorType, [
      "staff",
      "customer",
      "system",
    ]),
    index("audit_logs_entity_idx").on(
      t.organizationId,
      t.entityType,
      t.entityId,
      t.createdAt,
    ),
  ],
);
export type AuditLogsRecord = typeof auditLogs.$inferSelect;

export const automationOutbox = pgTable(
  "automation_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", {
      enum: ["pending", "processing", "completed", "failed", "dead"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: instant("available_at").notNull().defaultNow(),
    lockedAt: instant("locked_at"),
    lockedBy: text("locked_by"),
    leaseExpiresAt: instant("lease_expires_at"),
    completedAt: instant("completed_at"),
    lastErrorCode: text("last_error_code"),
    ...timestamps(),
  },
  (t) => [
    unique("automation_outbox_org_id_uq").on(t.organizationId, t.id),
    allowed("automation_outbox_status_check", t.status, [
      "pending",
      "processing",
      "completed",
      "failed",
      "dead",
    ]),
    check("automation_outbox_attempts_check", sql`${t.attempts} >= 0`),
    check(
      "automation_outbox_lease_check",
      sql`${t.status} <> 'processing' or (${t.lockedAt} is not null and ${t.lockedBy} is not null and ${t.leaseExpiresAt} > ${t.lockedAt})`,
    ),
    check(
      "automation_outbox_completed_check",
      sql`${t.status} <> 'completed' or ${t.completedAt} is not null`,
    ),
    unique("automation_outbox_idempotency_uq").on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index("automation_outbox_queue_idx").on(t.status, t.availableAt),
  ],
);
export type AutomationOutboxRecord = typeof automationOutbox.$inferSelect;
