import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { designPurchases } from "./design-purchases";

export const whatsappContacts = pgTable("whatsapp_contacts", {
  phone: text("phone").primaryKey(),

  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),

  optedOutAt: timestamp("opted_out_at", { withTimezone: true }),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    wamid: text("wamid").unique(),

    dedupeKey: text("dedupe_key").unique(),

    purchaseId: uuid("purchase_id").references(() => designPurchases.id, {
      onDelete: "set null",
    }),

    customerPhone: text("customer_phone").notNull(),

    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),

    messageType: text("message_type", {
      enum: ["text", "template", "document", "interactive", "unknown"],
    }).notNull(),

    notificationKind: text("notification_kind", {
      enum: [
        "purchaseCreated",
        "paymentSubmitted",
        "paymentConfirmed",
        "advisorFollowup",
      ],
    }),

    body: text("body"),

    templateName: text("template_name"),

    status: text("status", {
      enum: [
        "queued",
        "sending",
        "sent",
        "delivered",
        "read",
        "failed",
        "uncertain",
      ],
    }),

    rawMessageType: text("raw_message_type"),

    errorCode: text("error_code"),

    eventAt: timestamp("event_at", { withTimezone: true }).notNull(),

    statusAt: timestamp("status_at", { withTimezone: true }),

    attemptedAt: timestamp("attempted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("whatsapp_messages_purchase_created_idx").on(
      table.purchaseId,
      table.createdAt,
    ),

    index("whatsapp_messages_phone_event_idx").on(
      table.customerPhone,
      table.eventAt,
    ),

    check(
      "whatsapp_messages_direction_check",
      sql`${table.direction} in ('inbound', 'outbound')`,
    ),

    check(
      "whatsapp_messages_type_check",
      sql`${table.messageType} in ('text', 'template', 'document', 'interactive', 'unknown')`,
    ),

    check(
      "whatsapp_messages_status_check",
      sql`${table.status} is null or ${table.status} in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'uncertain')`,
    ),
  ],
);

export type WhatsAppMessageRecord = typeof whatsappMessages.$inferSelect;
