import { sql } from "drizzle-orm";
import {
  foreignKey,
  check,
  integer,
  boolean,
  index,
  unique,
  uniqueIndex,
  pgTable,
  text,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { allowed, instant, timestamps, scopedForeignKey } from "./common";
import { organizations } from "./organization";
import { clients } from "./clients";
import { opportunities } from "./opportunities";
import { staffMemberships } from "./organization";
import { whatsappMessages } from "./whatsapp";

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    clientId: uuid("client_id"),
    opportunityId: uuid("opportunity_id"),
    assignedToId: uuid("assigned_to_id"),
    channel: text("channel", {
      enum: ["whatsapp", "email", "manual"],
    }).notNull(),
    externalAddress: text("external_address").notNull(), // Normalized phone / email.
    status: text("status", { enum: ["open", "waiting", "closed"] })
      .notNull()
      .default("open"),
    handlingMode: text("handling_mode", { enum: ["ai", "human", "paused"] })
      .notNull()
      .default("human"),
    lastInboundAt: instant("last_inbound_at"),
    lastActivityAt: instant("last_activity_at"),
    closedAt: instant("closed_at"),
    ...timestamps(),
  },
  (t) => [
    unique("conversations_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "conversations_clientId_fk",
      t.organizationId,
      t.clientId,
      clients.organizationId,
      clients.id,
    ),
    scopedForeignKey(
      "conversations_opportunityId_fk",
      t.organizationId,
      t.opportunityId,
      opportunities.organizationId,
      opportunities.id,
    ),
    scopedForeignKey(
      "conversations_assignedToId_fk",
      t.organizationId,
      t.assignedToId,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    allowed("conversations_channel_check", t.channel, [
      "whatsapp",
      "email",
      "manual",
    ]),
    allowed("conversations_status_check", t.status, [
      "open",
      "waiting",
      "closed",
    ]),
    allowed("conversations_handlingMode_check", t.handlingMode, [
      "ai",
      "human",
      "paused",
    ]),
    check(
      "conversations_closed_check",
      sql`${t.status} <> 'closed' or ${t.closedAt} is not null`,
    ),
    uniqueIndex("conversations_active_address_uq")
      .on(t.organizationId, t.channel, t.externalAddress)
      .where(sql`${t.status} in ('open', 'waiting')`),
    index("conversations_inbox_idx").on(
      t.organizationId,
      t.status,
      t.lastActivityAt,
    ),
  ],
);
export type ConversationsRecord = typeof conversations.$inferSelect;

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    conversationId: uuid("conversation_id").notNull(),
    whatsappMessageId: uuid("whatsapp_message_id").references(
      () => whatsappMessages.id,
      { onDelete: "restrict" },
    ),
    direction: text("direction", {
      enum: ["inbound", "outbound", "internal"],
    }).notNull(),
    authorClerkUserId: text("author_clerk_user_id"),
    authorKind: text("author_kind", {
      enum: ["customer", "staff", "ai", "system"],
    }).notNull(),
    body: text("body"), // Email/manual content; WhatsApp body remains in whatsapp_messages.
    externalMessageId: text("external_message_id"),
    idempotencyKey: text("idempotency_key"),
    occurredAt: instant("occurred_at").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("conversation_messages_org_id_uq").on(t.organizationId, t.id),
    unique("conversation_messages_conversation_id_uq").on(
      t.organizationId,
      t.conversationId,
      t.id,
    ),
    scopedForeignKey(
      "conversation_messages_conversationId_fk",
      t.organizationId,
      t.conversationId,
      conversations.organizationId,
      conversations.id,
    ),
    allowed("conversation_messages_direction_check", t.direction, [
      "inbound",
      "outbound",
      "internal",
    ]),
    allowed("conversation_messages_authorKind_check", t.authorKind, [
      "customer",
      "staff",
      "ai",
      "system",
    ]),
    unique("conversation_messages_whatsapp_uq").on(t.whatsappMessageId),
    unique("conversation_messages_idempotency_uq").on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index("conversation_messages_timeline_idx").on(
      t.organizationId,
      t.conversationId,
      t.occurredAt,
    ),
  ],
);
export type ConversationMessagesRecord =
  typeof conversationMessages.$inferSelect;

export const aiAgentRuns = pgTable(
  "ai_agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    conversationId: uuid("conversation_id").notNull(),
    triggerMessageId: uuid("trigger_message_id").notNull(),
    replyMessageId: uuid("reply_message_id"),
    model: text("model").notNull(),
    policyVersion: text("policy_version").notNull(),
    knowledgeReferences: jsonb("knowledge_references")
      .$type<{ sanityId: string; revision: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text("status", {
      enum: ["queued", "running", "completed", "blocked", "failed"],
    })
      .notNull()
      .default("queued"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    scopeApproved: boolean("scope_approved").notNull().default(false),
    errorCode: text("error_code"),
    startedAt: instant("started_at"),
    completedAt: instant("completed_at"),
    ...timestamps(),
  },
  (t) => [
    unique("ai_agent_runs_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "ai_agent_runs_conversationId_fk",
      t.organizationId,
      t.conversationId,
      conversations.organizationId,
      conversations.id,
    ),
    foreignKey({
      name: "ai_agent_runs_triggerMessageId_conversation_fk",
      columns: [t.organizationId, t.conversationId, t.triggerMessageId],
      foreignColumns: [
        conversationMessages.organizationId,
        conversationMessages.conversationId,
        conversationMessages.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "ai_agent_runs_replyMessageId_conversation_fk",
      columns: [t.organizationId, t.conversationId, t.replyMessageId],
      foreignColumns: [
        conversationMessages.organizationId,
        conversationMessages.conversationId,
        conversationMessages.id,
      ],
    }).onDelete("restrict"),
    allowed("ai_agent_runs_status_check", t.status, [
      "queued",
      "running",
      "completed",
      "blocked",
      "failed",
    ]),
    check(
      "ai_agent_runs_tokens_check",
      sql`(${t.inputTokens} is null or ${t.inputTokens} >= 0) and (${t.outputTokens} is null or ${t.outputTokens} >= 0)`,
    ),
    check(
      "ai_agent_runs_completed_check",
      sql`${t.status} <> 'completed' or (${t.scopeApproved} = true and ${t.completedAt} is not null)`,
    ),
    unique("ai_agent_runs_trigger_uq").on(t.organizationId, t.triggerMessageId),
    index("ai_agent_runs_queue_idx").on(
      t.organizationId,
      t.status,
      t.createdAt,
    ),
  ],
);
export type AiAgentRunsRecord = typeof aiAgentRuns.$inferSelect;
