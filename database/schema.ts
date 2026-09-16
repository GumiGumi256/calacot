// db/schema.ts
import { check, index, uniqueIndex, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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

export const realEstateEnquiries = pgTable("real_estate_enquiries", {
  id: uuid("id").primaryKey(),
  payloadHash: text("payload_hash").notNull(),
  intent: text("intent", { enum: ["buy-home", "buy-land", "sell-property"] }).notNull(),
  propertyType: text("property_type").notNull(),
  location: text("location").notNull(),
  timeline: text("timeline").notNull(),
  currency: text("currency", { enum: ["UGX", "USD"] }).notNull(),
  budgetMin: numeric("budget_min", { precision: 17, scale: 2 }),
  budgetMax: numeric("budget_max", { precision: 17, scale: 2 }),
  askingPrice: numeric("asking_price", { precision: 17, scale: 2 }),
  relationship: text("relationship", { enum: ["owner", "representative"] }),
  notes: text("notes"),
  fullName: text("full_name").notNull(),
  contactMethod: text("contact_method", { enum: ["email", "phone", "whatsapp"] }).notNull(),
  email: text("email"),
  phone: text("phone"),
  status: text("status", { enum: ["new", "contacted", "closed"] }).default("new").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("estate_enquiries_status_created_idx").on(table.status, table.createdAt),
  check("estate_enquiries_intent_check", sql`${table.intent} in ('buy-home', 'buy-land', 'sell-property')`),
  check("estate_enquiries_currency_check", sql`${table.currency} in ('UGX', 'USD')`),
  check("estate_enquiries_contact_check", sql`${table.contactMethod} in ('email', 'phone', 'whatsapp')`),
  check("estate_enquiries_status_check", sql`${table.status} in ('new', 'contacted', 'closed')`),
  check("estate_enquiries_budget_check", sql`(${table.budgetMin} is null or ${table.budgetMin} > 0) and (${table.budgetMax} is null or ${table.budgetMax} > 0) and (${table.budgetMin} is null or ${table.budgetMax} is null or ${table.budgetMax} >= ${table.budgetMin})`),
  check("estate_enquiries_price_check", sql`${table.askingPrice} is null or ${table.askingPrice} > 0`),
  check("estate_enquiries_reachable_check", sql`(${table.contactMethod} = 'email' and nullif(${table.email}, '') is not null) or (${table.contactMethod} in ('phone', 'whatsapp') and nullif(${table.phone}, '') is not null)`),
  check("estate_enquiries_relationship_check", sql`${table.relationship} is null or ${table.relationship} in ('owner', 'representative')`),
  check("estate_enquiries_seller_check", sql`${table.intent} <> 'sell-property' or ${table.relationship} is not null`),
]);


export const propertyLeads = pgTable("property_leads", {
  id: uuid("id").defaultRandom().primaryKey(),

  submissionType: text("submission_type", {
    enum: ["individual", "development"],
  }).notNull(),

  propertyType: text("property_type").notNull(),
  location: text("location").notNull(),
  details: text("details"),

  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),

  status: text("status", {
    enum: ["new", "contacted", "closed"],
  })
    .default("new")
    .notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export const designPurchases = pgTable(
  "design_purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // --------------------------------------------------
    // CUSTOMER
    // --------------------------------------------------

    // Always derive this from Clerk on the server.
    clerkUserId: text("clerk_user_id").notNull(),

    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").notNull(),

    // --------------------------------------------------
    // DESIGN SNAPSHOT
    // --------------------------------------------------

    sanityDesignId: text("sanity_design_id").notNull(),

    designSlug: text("design_slug").notNull(),

    designTitle: text("design_title").notNull(),

    designCode: text("design_code"),

    // --------------------------------------------------
    // PACKAGE SNAPSHOT
    // --------------------------------------------------

    sanityPackageId: text("sanity_package_id").notNull(),

    packageSlug: text("package_slug"),

    packageName: text("package_name").notNull(),

    packageDescription: text("package_description"),

    packageIncludes: jsonb("package_includes")
      .$type<string[]>()
      .notNull(),

    // --------------------------------------------------
    // AMOUNT
    // --------------------------------------------------

    amount: numeric("amount", {
      precision: 17,
      scale: 2,
    }).notNull(),

    currency: text("currency", {
      enum: ["UGX", "USD"],
    })
      .default("UGX")
      .notNull(),

    // --------------------------------------------------
    // MANUAL PAYMENT
    // --------------------------------------------------

    purchaseReference: text("purchase_reference").notNull().unique(),
    invoiceNumber: text("invoice_number").notNull().unique(),
    invoiceIssuedAt: timestamp("invoice_issued_at", { withTimezone: true }).defaultNow().notNull(),
    invoiceEmailSentAt: timestamp("invoice_email_sent_at", { withTimezone: true }),
    confirmationEmailSentAt: timestamp("confirmation_email_sent_at", { withTimezone: true }),
    revision: numeric("revision", { precision: 10, scale: 0 }).default("0").notNull(),
    whatsappPhone: text("whatsapp_phone"),
    whatsappConsentAt: timestamp("whatsapp_consent_at", { withTimezone: true }),
    whatsappStatus: text("whatsapp_status", { enum: ["not_started", "message_sent", "customer_replied", "advisor_connected", "closed", "failed"] }).default("not_started").notNull(),
    whatsappLastMessageId: text("whatsapp_last_message_id"),
    whatsappStartedAt: timestamp("whatsapp_started_at", { withTimezone: true }),
    whatsappLastActivityAt: timestamp("whatsapp_last_activity_at", { withTimezone: true }),

purchaseStatus: text("purchase_status", {
  enum: [
    "awaiting_payment",
    "awaiting_contact",
    "payment_submitted",
    "completed",
    "cancelled",
  ],
})
  .default("awaiting_payment")
  .notNull(),

    paymentMethod: text("payment_method", {
      enum: [
        "mobile_money",
        "bank_transfer",
        "cash",
        "other",
      ],
    }),

    // User submits the Mobile Money / bank transaction reference.
    paymentReference: text("payment_reference"),

    paymentStatus: text("payment_status", {
      enum: [
        "pending",
        "submitted",
        "confirmed",
        "rejected",
      ],
    })
      .default("pending")
      .notNull(),

    paymentSubmittedAt: timestamp("payment_submitted_at", {
      withTimezone: true,
    }),

    // --------------------------------------------------
    // ACCESS
    // --------------------------------------------------

    accessStatus: text("access_status", {
      enum: [
        "pending",
        "active",
        "revoked",
      ],
    })
      .default("pending")
      .notNull(),

    // --------------------------------------------------
    // ADMIN REVIEW
    // --------------------------------------------------
preferredContactMethod: text("preferred_contact_method", {
  enum: ["whatsapp", "phone", "email"],
}),

customerNote: text("customer_note"),

contactedAt: timestamp("contacted_at", {
  withTimezone: true,
}),
assignedTo: text("assigned_to"),
    // Clerk ID of admin who confirmed/rejected payment.
    reviewedBy: text("reviewed_by"),

    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
    }),

    adminNotes: text("admin_notes"),

    // --------------------------------------------------
    // TERMS
    // --------------------------------------------------

    termsVersion: text("terms_version"),

    termsAcceptedAt: timestamp("terms_accepted_at", {
      withTimezone: true,
    }),

    // --------------------------------------------------
    // TIMESTAMPS
    // --------------------------------------------------

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },

  (table) => [
    index("design_purchases_whatsapp_phone_idx").on(table.whatsappPhone),
    check("design_purchases_whatsapp_status_check", sql`${table.whatsappStatus} in ('not_started', 'message_sent', 'customer_replied', 'advisor_connected', 'closed', 'failed')`),
    uniqueIndex("design_purchases_open_unique").on(table.clerkUserId, table.sanityDesignId, table.sanityPackageId)
      .where(sql`${table.purchaseStatus} in ('awaiting_payment', 'awaiting_contact', 'payment_submitted')`),
    index("design_purchases_purchase_created_idx").on(table.purchaseStatus, table.createdAt),
    check("design_purchases_purchase_status_check", sql`${table.purchaseStatus} in ('awaiting_payment', 'awaiting_contact', 'payment_submitted', 'completed', 'cancelled')`),
    check("design_purchases_contact_check", sql`${table.preferredContactMethod} is null or ${table.preferredContactMethod} in ('whatsapp', 'phone', 'email')`),
    check("design_purchases_includes_check", sql`jsonb_typeof(${table.packageIncludes}) = 'array'`),
    check("design_purchases_active_check", sql`${table.accessStatus} <> 'active' or (${table.paymentStatus} = 'confirmed' and ${table.purchaseStatus} = 'completed')`),
    check("design_purchases_completed_check", sql`${table.purchaseStatus} <> 'completed' or ${table.paymentStatus} = 'confirmed'`),
    index("design_purchases_user_created_idx").on(
      table.clerkUserId,
      table.createdAt
    ),

    index("design_purchases_payment_status_idx").on(
      table.paymentStatus,
      table.createdAt
    ),

    index("design_purchases_design_idx").on(
      table.sanityDesignId
    ),

    index("design_purchases_access_status_idx").on(
      table.accessStatus
    ),

    check(
      "design_purchases_amount_check",
      sql`${table.amount} > 0`
    ),

    check(
      "design_purchases_currency_check",
      sql`${table.currency} in ('UGX', 'USD')`
    ),

    check(
      "design_purchases_payment_method_check",
      sql`
        ${table.paymentMethod} is null or
        ${table.paymentMethod} in (
          'mobile_money',
          'bank_transfer',
          'cash',
          'other'
        )
      `
    ),

    check(
      "design_purchases_payment_status_check",
      sql`
        ${table.paymentStatus} in (
          'pending',
          'submitted',
          'confirmed',
          'rejected'
        )
      `
    ),

    check(
      "design_purchases_access_status_check",
      sql`
        ${table.accessStatus} in (
          'pending',
          'active',
          'revoked'
        )
      `
    ),
  ]
);
export type DesignPurchaseRecord = typeof designPurchases.$inferSelect;

// One small per-number record tracks the service window and global opt-out,
// including senders whose message cannot be associated with a purchase yet.
export const whatsappContacts = pgTable("whatsapp_contacts", {
  phone: text("phone").primaryKey(),
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
  optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const whatsappMessages = pgTable("whatsapp_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  wamid: text("wamid").unique(),
  dedupeKey: text("dedupe_key").unique(),
  purchaseId: uuid("purchase_id").references(() => designPurchases.id, { onDelete: "set null" }),
  customerPhone: text("customer_phone").notNull(),
  direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
  messageType: text("message_type", { enum: ["text", "template", "document", "interactive", "unknown"] }).notNull(),
  notificationKind: text("notification_kind", { enum: ["purchaseCreated", "paymentSubmitted", "paymentConfirmed", "advisorFollowup"] }),
  body: text("body"),
  templateName: text("template_name"),
  status: text("status", { enum: ["queued", "sending", "sent", "delivered", "read", "failed", "uncertain"] }),
  rawMessageType: text("raw_message_type"),
  errorCode: text("error_code"),
  eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
  statusAt: timestamp("status_at", { withTimezone: true }),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("whatsapp_messages_purchase_created_idx").on(table.purchaseId, table.createdAt),
  index("whatsapp_messages_phone_event_idx").on(table.customerPhone, table.eventAt),
  check("whatsapp_messages_direction_check", sql`${table.direction} in ('inbound', 'outbound')`),
  check("whatsapp_messages_type_check", sql`${table.messageType} in ('text', 'template', 'document', 'interactive', 'unknown')`),
  check("whatsapp_messages_status_check", sql`${table.status} is null or ${table.status} in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'uncertain')`),
]);
export type WhatsAppMessageRecord = typeof whatsappMessages.$inferSelect;
