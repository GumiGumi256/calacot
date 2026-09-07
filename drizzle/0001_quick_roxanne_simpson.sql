CREATE TABLE "real_estate_enquiries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payload_hash" text NOT NULL,
	"intent" text NOT NULL,
	"property_type" text NOT NULL,
	"location" text NOT NULL,
	"timeline" text NOT NULL,
	"currency" text NOT NULL,
	"budget_min" numeric(17, 2),
	"budget_max" numeric(17, 2),
	"asking_price" numeric(17, 2),
	"relationship" text,
	"notes" text,
	"full_name" text NOT NULL,
	"contact_method" text NOT NULL,
	"email" text,
	"phone" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estate_enquiries_intent_check" CHECK ("real_estate_enquiries"."intent" in ('buy-home', 'buy-land', 'sell-property')),
	CONSTRAINT "estate_enquiries_currency_check" CHECK ("real_estate_enquiries"."currency" in ('UGX', 'USD')),
	CONSTRAINT "estate_enquiries_contact_check" CHECK ("real_estate_enquiries"."contact_method" in ('email', 'phone', 'whatsapp')),
	CONSTRAINT "estate_enquiries_status_check" CHECK ("real_estate_enquiries"."status" in ('new', 'contacted', 'closed')),
	CONSTRAINT "estate_enquiries_budget_check" CHECK (("real_estate_enquiries"."budget_min" is null or "real_estate_enquiries"."budget_min" > 0) and ("real_estate_enquiries"."budget_max" is null or "real_estate_enquiries"."budget_max" > 0) and ("real_estate_enquiries"."budget_min" is null or "real_estate_enquiries"."budget_max" is null or "real_estate_enquiries"."budget_max" >= "real_estate_enquiries"."budget_min")),
	CONSTRAINT "estate_enquiries_price_check" CHECK ("real_estate_enquiries"."asking_price" is null or "real_estate_enquiries"."asking_price" > 0),
	CONSTRAINT "estate_enquiries_reachable_check" CHECK (("real_estate_enquiries"."contact_method" = 'email' and nullif("real_estate_enquiries"."email", '') is not null) or ("real_estate_enquiries"."contact_method" in ('phone', 'whatsapp') and nullif("real_estate_enquiries"."phone", '') is not null)),
	CONSTRAINT "estate_enquiries_relationship_check" CHECK ("real_estate_enquiries"."relationship" is null or "real_estate_enquiries"."relationship" in ('owner', 'representative')),
	CONSTRAINT "estate_enquiries_seller_check" CHECK ("real_estate_enquiries"."intent" <> 'sell-property' or "real_estate_enquiries"."relationship" is not null)
);
--> statement-breakpoint
ALTER TABLE "leads" RENAME COLUMN "project_brief" TO "project_overview";--> statement-breakpoint
CREATE INDEX "estate_enquiries_status_created_idx" ON "real_estate_enquiries" USING btree ("status","created_at");