import {
  check,
  index,
  uniqueIndex,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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

    invoiceIssuedAt: timestamp("invoice_issued_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    invoiceEmailSentAt: timestamp("invoice_email_sent_at", {
      withTimezone: true,
    }),

    confirmationEmailSentAt: timestamp("confirmation_email_sent_at", {
      withTimezone: true,
    }),

    invoiceTeamEmailSentAt: timestamp("invoice_team_email_sent_at", {
      withTimezone: true,
    }),

    confirmationTeamEmailSentAt: timestamp("confirmation_team_email_sent_at", {
      withTimezone: true,
    }),

    revision: numeric("revision", { precision: 10, scale: 0 })
      .default("0")
      .notNull(),

    whatsappPhone: text("whatsapp_phone"),

    whatsappConsentAt: timestamp("whatsapp_consent_at", { withTimezone: true }),

    whatsappStatus: text("whatsapp_status", {
      enum: [
        "not_started",
        "message_sent",
        "customer_replied",
        "advisor_connected",
        "closed",
        "failed",
      ],
    })
      .default("not_started")
      .notNull(),

    whatsappLastMessageId: text("whatsapp_last_message_id"),

    whatsappStartedAt: timestamp("whatsapp_started_at", { withTimezone: true }),

    whatsappLastActivityAt: timestamp("whatsapp_last_activity_at", {
      withTimezone: true,
    }),

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
      enum: ["mobile_money", "bank_transfer", "cash", "other"],
    }),

    // User submits the Mobile Money / bank transaction reference.

    paymentReference: text("payment_reference"),

    paymentStatus: text("payment_status", {
      enum: ["pending", "submitted", "confirmed", "rejected"],
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
      enum: ["pending", "active", "revoked"],
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

    check(
      "design_purchases_whatsapp_status_check",
      sql`${table.whatsappStatus} in ('not_started', 'message_sent', 'customer_replied', 'advisor_connected', 'closed', 'failed')`,
    ),

    uniqueIndex("design_purchases_open_unique")
      .on(table.clerkUserId, table.sanityDesignId, table.sanityPackageId)

      .where(
        sql`${table.purchaseStatus} in ('awaiting_payment', 'awaiting_contact', 'payment_submitted')`,
      ),

    index("design_purchases_purchase_created_idx").on(
      table.purchaseStatus,
      table.createdAt,
    ),

    check(
      "design_purchases_purchase_status_check",
      sql`${table.purchaseStatus} in ('awaiting_payment', 'awaiting_contact', 'payment_submitted', 'completed', 'cancelled')`,
    ),

    check(
      "design_purchases_contact_check",
      sql`${table.preferredContactMethod} is null or ${table.preferredContactMethod} in ('whatsapp', 'phone', 'email')`,
    ),

    check(
      "design_purchases_includes_check",
      sql`jsonb_typeof(${table.packageIncludes}) = 'array'`,
    ),

    check(
      "design_purchases_active_check",
      sql`${table.accessStatus} <> 'active' or (${table.paymentStatus} = 'confirmed' and ${table.purchaseStatus} = 'completed')`,
    ),

    check(
      "design_purchases_completed_check",
      sql`${table.purchaseStatus} <> 'completed' or ${table.paymentStatus} = 'confirmed'`,
    ),

    index("design_purchases_user_created_idx").on(
      table.clerkUserId,

      table.createdAt,
    ),

    index("design_purchases_payment_status_idx").on(
      table.paymentStatus,

      table.createdAt,
    ),

    index("design_purchases_design_idx").on(table.sanityDesignId),

    index("design_purchases_access_status_idx").on(table.accessStatus),

    check(
      "design_purchases_amount_check",

      sql`${table.amount} > 0`,
    ),

    check(
      "design_purchases_currency_check",

      sql`${table.currency} in ('UGX', 'USD')`,
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

      `,
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

      `,
    ),

    check(
      "design_purchases_access_status_check",

      sql`

        ${table.accessStatus} in (

          'pending',

          'active',

          'revoked'

        )

      `,
    ),
  ],
);

export type DesignPurchaseRecord = typeof designPurchases.$inferSelect;

// One small per-number record tracks the service window and global opt-out,

// including senders whose message cannot be associated with a purchase yet.
