ALTER TABLE "design_purchases" ADD COLUMN "whatsapp_phone" text;
--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "whatsapp_consent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "whatsapp_status" text DEFAULT 'not_started' NOT NULL;
--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "whatsapp_last_message_id" text;
--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "whatsapp_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "whatsapp_last_activity_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "design_purchases_whatsapp_phone_idx" ON "design_purchases" USING btree ("whatsapp_phone");
--> statement-breakpoint
ALTER TABLE "design_purchases" ADD CONSTRAINT "design_purchases_whatsapp_status_check" CHECK ("design_purchases"."whatsapp_status" in ('not_started', 'message_sent', 'customer_replied', 'advisor_connected', 'closed', 'failed'));
--> statement-breakpoint
CREATE TABLE "whatsapp_contacts" (
  "phone" text PRIMARY KEY NOT NULL,
  "last_inbound_at" timestamp with time zone,
  "opted_out_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wamid" text UNIQUE,
  "dedupe_key" text UNIQUE,
  "purchase_id" uuid,
  "customer_phone" text NOT NULL,
  "direction" text NOT NULL,
  "message_type" text NOT NULL,
  "notification_kind" text,
  "body" text,
  "template_name" text,
  "status" text,
  "raw_message_type" text,
  "error_code" text,
  "event_at" timestamp with time zone NOT NULL,
  "status_at" timestamp with time zone,
  "attempted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "whatsapp_messages_purchase_id_design_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "design_purchases"("id") ON DELETE SET NULL,
  CONSTRAINT "whatsapp_messages_direction_check" CHECK ("direction" in ('inbound', 'outbound')),
  CONSTRAINT "whatsapp_messages_type_check" CHECK ("message_type" in ('text', 'template', 'document', 'interactive', 'unknown')),
  CONSTRAINT "whatsapp_messages_status_check" CHECK ("status" is null or "status" in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'uncertain'))
);
--> statement-breakpoint
CREATE INDEX "whatsapp_messages_purchase_created_idx" ON "whatsapp_messages" USING btree ("purchase_id", "created_at");
--> statement-breakpoint
CREATE INDEX "whatsapp_messages_phone_event_idx" ON "whatsapp_messages" USING btree ("customer_phone", "event_at");
