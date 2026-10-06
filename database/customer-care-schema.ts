import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { whatsappMessages } from "./schema";

export const careConversations = pgTable(
  "care_conversations",
  {
    phone: text("phone").primaryKey(),
    mode: text("mode", { enum: ["bot", "human", "closed"] })
      .notNull()
      .default("bot"),
    clerkUserId: text("clerk_user_id"),
    linkedUntil: timestamp("linked_until", { withTimezone: true }),
    businessUnit: text("business_unit"),
    assignedTo: text("assigned_to"),
    organizationId: text("organization_id"),
    businessAccountId: text("business_account_id"),
    menuState: jsonb("menu_state").notNull().default({}),
    sessionRevision: integer("session_revision").notNull().default(0),
    sessionExpiresAt: timestamp("session_expires_at", { withTimezone: true }),
    lastProcessedAt: timestamp("last_processed_at", { withTimezone: true }),
    lastProcessedMessageId: uuid("last_processed_message_id"),
    handoffReason: text("handoff_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check("care_mode_check", sql`${t.mode} in ('bot','human','closed')`)],
);
export const careJobs = pgTable(
  "care_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .unique()
      .references(() => whatsappMessages.id, { onDelete: "cascade" }),
    phone: text("phone")
      .notNull()
      .references(() => careConversations.phone),
    state: text("state", { enum: ["queued", "processing", "done", "dead"] })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    leaseToken: uuid("lease_token"),
    errorCode: text("error_code"),
    decision: jsonb("decision"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("care_jobs_ready_idx").on(t.state, t.availableAt),
    check(
      "care_job_state_check",
      sql`${t.state} in ('queued','processing','done','dead')`,
    ),
  ],
);
export const careRequests = pgTable(
  "care_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .unique()
      .references(() => careJobs.id, { onDelete: "set null" }),
    phone: text("phone")
      .notNull()
      .references(() => careConversations.phone),
    kind: text("kind", { enum: ["lead", "callback", "handoff"] }).notNull(),
    businessUnit: text("business_unit"),
    fields: jsonb("fields").notNull().default({}),
    status: text("status", { enum: ["new", "contacted", "closed"] })
      .notNull()
      .default("new"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("care_requests_status_idx").on(t.status, t.createdAt),
    check(
      "care_request_kind_check",
      sql`${t.kind} in ('lead','callback','handoff')`,
    ),
    check(
      "care_request_status_check",
      sql`${t.status} in ('new','contacted','closed')`,
    ),
  ],
);
export const careLinkTokens = pgTable("care_link_tokens", {
  hash: text("hash").primaryKey(),
  phone: text("phone")
    .notNull()
    .references(() => careConversations.phone),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});
export const careAudit = pgTable("care_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(),
  phone: text("phone"),
  action: text("action").notNull(),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
