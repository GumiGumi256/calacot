ALTER TABLE "design_purchases" ALTER COLUMN "purchase_status" SET DEFAULT 'awaiting_payment';--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "purchase_reference" text;--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "invoice_number" text;--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "invoice_issued_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "invoice_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "confirmation_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "design_purchases" ADD COLUMN "revision" numeric(10, 0) DEFAULT '0' NOT NULL;--> statement-breakpoint
-- Preserve old purchases: derive unique legacy references from the full UUID.
UPDATE "design_purchases" SET
  "purchase_reference" = 'CAL-DES-' || upper(replace("id"::text, '-', '')),
  "invoice_number" = 'CAL-INV-' || extract(year from "created_at" at time zone 'UTC')::text || '-' || upper(replace("id"::text, '-', '')),
  "invoice_issued_at" = "created_at",
  "purchase_status" = CASE WHEN "purchase_status" IN ('saved', 'ready_for_payment') THEN 'awaiting_payment' ELSE "purchase_status" END;--> statement-breakpoint
ALTER TABLE "design_purchases" ALTER COLUMN "purchase_reference" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "design_purchases" ALTER COLUMN "invoice_number" SET NOT NULL;--> statement-breakpoint
-- Abort for legacy duplicates instead of silently deleting/cancelling customer requests.
-- Resolve any reported duplicate open requests before rerunning the migration.
CREATE UNIQUE INDEX "design_purchases_open_unique" ON "design_purchases" USING btree ("clerk_user_id","sanity_design_id","sanity_package_id") WHERE "design_purchases"."purchase_status" in ('awaiting_payment', 'awaiting_contact', 'payment_submitted');--> statement-breakpoint
CREATE INDEX "design_purchases_purchase_created_idx" ON "design_purchases" USING btree ("purchase_status","created_at");--> statement-breakpoint
ALTER TABLE "design_purchases" ADD CONSTRAINT "design_purchases_purchase_reference_unique" UNIQUE("purchase_reference");--> statement-breakpoint
ALTER TABLE "design_purchases" ADD CONSTRAINT "design_purchases_invoice_number_unique" UNIQUE("invoice_number");--> statement-breakpoint
ALTER TABLE "design_purchases" ADD CONSTRAINT "design_purchases_purchase_status_check" CHECK ("design_purchases"."purchase_status" in ('awaiting_payment', 'awaiting_contact', 'payment_submitted', 'completed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "design_purchases" ADD CONSTRAINT "design_purchases_contact_check" CHECK ("design_purchases"."preferred_contact_method" is null or "design_purchases"."preferred_contact_method" in ('whatsapp', 'phone', 'email'));--> statement-breakpoint
ALTER TABLE "design_purchases" ADD CONSTRAINT "design_purchases_includes_check" CHECK (jsonb_typeof("design_purchases"."package_includes") = 'array');--> statement-breakpoint
ALTER TABLE "design_purchases" ADD CONSTRAINT "design_purchases_active_check" CHECK ("design_purchases"."access_status" <> 'active' or ("design_purchases"."payment_status" = 'confirmed' and "design_purchases"."purchase_status" = 'completed'));--> statement-breakpoint
ALTER TABLE "design_purchases" ADD CONSTRAINT "design_purchases_completed_check" CHECK ("design_purchases"."purchase_status" <> 'completed' or "design_purchases"."payment_status" = 'confirmed');
