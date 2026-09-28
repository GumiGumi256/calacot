ALTER TABLE "design_purchases" ADD COLUMN IF NOT EXISTS "invoice_team_email_sent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN IF NOT EXISTS "confirmation_team_email_sent_at" timestamp with time zone;
