ALTER TABLE "care_conversations" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "care_conversations" ADD COLUMN "business_account_id" text;--> statement-breakpoint
ALTER TABLE "care_conversations" ADD COLUMN "menu_state" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "care_conversations" ADD COLUMN "session_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "care_conversations" ADD COLUMN "session_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "care_conversations" ADD COLUMN "last_processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "care_conversations" ADD COLUMN "last_processed_message_id" uuid;--> statement-breakpoint
ALTER TABLE "care_conversations" ADD COLUMN "handoff_reason" text;