CREATE TABLE "property_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_type" text NOT NULL,
	"property_type" text NOT NULL,
	"location" text NOT NULL,
	"details" text,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
