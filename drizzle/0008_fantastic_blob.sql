CREATE TABLE "whatsapp_contacts" (
	"phone" text PRIMARY KEY NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"opted_out_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wamid" text,
	"dedupe_key" text,
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
	CONSTRAINT "whatsapp_messages_wamid_unique" UNIQUE("wamid"),
	CONSTRAINT "whatsapp_messages_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "whatsapp_messages_direction_check" CHECK ("whatsapp_messages"."direction" in ('inbound', 'outbound')),
	CONSTRAINT "whatsapp_messages_type_check" CHECK ("whatsapp_messages"."message_type" in ('text', 'template', 'document', 'interactive', 'unknown')),
	CONSTRAINT "whatsapp_messages_status_check" CHECK ("whatsapp_messages"."status" is null or "whatsapp_messages"."status" in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'uncertain'))
);
--> statement-breakpoint
CREATE TABLE "care_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"phone" text,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_conversations" (
	"phone" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'bot' NOT NULL,
	"clerk_user_id" text,
	"linked_until" timestamp with time zone,
	"business_unit" text,
	"assigned_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "care_mode_check" CHECK ("care_conversations"."mode" in ('bot','human','closed'))
);
--> statement-breakpoint
CREATE TABLE "care_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" uuid,
	"error_code" text,
	"decision" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "care_jobs_message_id_unique" UNIQUE("message_id"),
	CONSTRAINT "care_job_state_check" CHECK ("care_jobs"."state" in ('queued','processing','done','dead'))
);
--> statement-breakpoint
CREATE TABLE "care_link_tokens" (
	"hash" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "care_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"phone" text NOT NULL,
	"kind" text NOT NULL,
	"business_unit" text,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "care_requests_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "care_request_kind_check" CHECK ("care_requests"."kind" in ('lead','callback','handoff')),
	CONSTRAINT "care_request_status_check" CHECK ("care_requests"."status" in ('new','contacted','closed'))
);
--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "invoice_team_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "confirmation_team_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "whatsapp_phone" text;--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "whatsapp_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "whatsapp_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "whatsapp_last_message_id" text;--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "whatsapp_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "whatsapp_last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_purchase_id_design_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."design_purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_jobs" ADD CONSTRAINT "care_jobs_message_id_whatsapp_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."whatsapp_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_jobs" ADD CONSTRAINT "care_jobs_phone_care_conversations_phone_fk" FOREIGN KEY ("phone") REFERENCES "public"."care_conversations"("phone") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_link_tokens" ADD CONSTRAINT "care_link_tokens_phone_care_conversations_phone_fk" FOREIGN KEY ("phone") REFERENCES "public"."care_conversations"("phone") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_requests" ADD CONSTRAINT "care_requests_job_id_care_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."care_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_requests" ADD CONSTRAINT "care_requests_phone_care_conversations_phone_fk" FOREIGN KEY ("phone") REFERENCES "public"."care_conversations"("phone") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_messages_purchase_created_idx" ON "whatsapp_messages" USING btree ("purchase_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_phone_event_idx" ON "whatsapp_messages" USING btree ("customer_phone","event_at");--> statement-breakpoint
CREATE INDEX "care_jobs_ready_idx" ON "care_jobs" USING btree ("state","available_at");--> statement-breakpoint
CREATE INDEX "care_requests_status_idx" ON "care_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "design_purchases_whatsapp_phone_idx" ON "design_purchases" USING btree ("whatsapp_phone");--> statement-breakpoint
ALTER TABLE "design_purchases" ADD CONSTRAINT "design_purchases_whatsapp_status_check" CHECK ("design_purchases"."whatsapp_status" in ('not_started', 'message_sent', 'customer_replied', 'advisor_connected', 'closed', 'failed'));