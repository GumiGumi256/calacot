CREATE TABLE "design_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_phone" text NOT NULL,
	"sanity_design_id" text NOT NULL,
	"design_slug" text NOT NULL,
	"design_title" text NOT NULL,
	"design_code" text,
	"sanity_package_id" text NOT NULL,
	"package_slug" text,
	"package_name" text NOT NULL,
	"package_description" text,
	"package_includes" jsonb NOT NULL,
	"amount" numeric(17, 2) NOT NULL,
	"currency" text DEFAULT 'UGX' NOT NULL,
	"purchase_status" text DEFAULT 'saved' NOT NULL,
	"payment_method" text,
	"payment_reference" text,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"payment_submitted_at" timestamp with time zone,
	"access_status" text DEFAULT 'pending' NOT NULL,
	"preferred_contact_method" text,
	"customer_note" text,
	"contacted_at" timestamp with time zone,
	"assigned_to" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"admin_notes" text,
	"terms_version" text,
	"terms_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_purchases_amount_check" CHECK ("design_purchases"."amount" > 0),
	CONSTRAINT "design_purchases_currency_check" CHECK ("design_purchases"."currency" in ('UGX', 'USD')),
	CONSTRAINT "design_purchases_payment_method_check" CHECK (
        "design_purchases"."payment_method" is null or
        "design_purchases"."payment_method" in (
          'mobile_money',
          'bank_transfer',
          'cash',
          'other'
        )
      ),
	CONSTRAINT "design_purchases_payment_status_check" CHECK (
        "design_purchases"."payment_status" in (
          'pending',
          'submitted',
          'confirmed',
          'rejected'
        )
      ),
	CONSTRAINT "design_purchases_access_status_check" CHECK (
        "design_purchases"."access_status" in (
          'pending',
          'active',
          'revoked'
        )
      )
);
--> statement-breakpoint
CREATE INDEX "design_purchases_user_created_idx" ON "design_purchases" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE INDEX "design_purchases_payment_status_idx" ON "design_purchases" USING btree ("payment_status","created_at");--> statement-breakpoint
CREATE INDEX "design_purchases_design_idx" ON "design_purchases" USING btree ("sanity_design_id");--> statement-breakpoint
CREATE INDEX "design_purchases_access_status_idx" ON "design_purchases" USING btree ("access_status");