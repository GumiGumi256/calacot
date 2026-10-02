CREATE TABLE "document_counters" (
	"organization_id" text NOT NULL,
	"document_type" text NOT NULL,
	"period" text NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_counters_organization_id_document_type_period_pk" PRIMARY KEY("organization_id","document_type","period"),
	CONSTRAINT "document_counters_documentType_check" CHECK ("document_counters"."document_type" in ('quotation', 'invoice', 'receipt', 'credit_note', 'project')),
	CONSTRAINT "document_counters_positive_check" CHECK ("document_counters"."next_value" > 0)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legal_name" text NOT NULL,
	"email" text,
	"phone" text,
	"tax_identifier" text,
	"billing_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"display_name" text,
	"email" text,
	"clerk_role" text,
	"division" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_memberships_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "staff_memberships_clerk_org_uq" UNIQUE("organization_id","clerk_user_id"),
	CONSTRAINT "staff_memberships_status_check" CHECK ("staff_memberships"."status" in ('active', 'suspended', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"job_title" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_contacts_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "client_contacts_reachable_check" CHECK (nullif(trim("client_contacts"."email"), '') is not null or nullif(trim("client_contacts"."phone"), '') is not null)
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text DEFAULT 'individual' NOT NULL,
	"display_name" text NOT NULL,
	"legal_name" text,
	"clerk_user_id" text,
	"tax_identifier" text,
	"billing_address" jsonb,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "clients_kind_check" CHECK ("clients"."kind" in ('individual', 'company'))
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"division" text NOT NULL,
	"description" text,
	"unit" text DEFAULT 'item' NOT NULL,
	"default_unit_price" numeric(17, 2),
	"currency" text DEFAULT 'UGX' NOT NULL,
	"default_tax_rate" numeric(17, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"scope_template" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "services_code_org_uq" UNIQUE("organization_id","code"),
	CONSTRAINT "services_division_check" CHECK ("services"."division" in ('estates', 'architecture', 'painting', 'interiors', 'tech')),
	CONSTRAINT "services_currency_check" CHECK ("services"."currency" in ('UGX', 'USD')),
	CONSTRAINT "services_price_check" CHECK ("services"."default_unit_price" is null or "services"."default_unit_price" >= 0),
	CONSTRAINT "services_tax_check" CHECK ("services"."default_tax_rate" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" uuid,
	"owner_id" uuid,
	"title" text NOT NULL,
	"division" text NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"estimated_value" numeric(17, 2),
	"currency" text DEFAULT 'UGX' NOT NULL,
	"probability_percent" integer,
	"requirements" jsonb,
	"next_follow_up_at" timestamp with time zone,
	"expected_close_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"lost_reason" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "opportunities_stage_check" CHECK ("opportunities"."stage" in ('new', 'contacted', 'qualified', 'quotation_sent', 'negotiating', 'won', 'lost')),
	CONSTRAINT "opportunities_source_check" CHECK ("opportunities"."source" in ('website', 'whatsapp', 'email', 'referral', 'advertisement', 'manual')),
	CONSTRAINT "opportunities_division_check" CHECK ("opportunities"."division" in ('estates', 'architecture', 'painting', 'interiors', 'tech')),
	CONSTRAINT "opportunities_currency_check" CHECK ("opportunities"."currency" in ('UGX', 'USD')),
	CONSTRAINT "opportunities_value_check" CHECK ("opportunities"."estimated_value" is null or "opportunities"."estimated_value" >= 0),
	CONSTRAINT "opportunities_probability_check" CHECK ("opportunities"."probability_percent" is null or "opportunities"."probability_percent" between 0 and 100),
	CONSTRAINT "opportunities_closed_check" CHECK ("opportunities"."stage" not in ('won', 'lost') or "opportunities"."closed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "opportunity_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"body" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_activities_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "opportunity_activities_type_check" CHECK ("opportunity_activities"."type" in ('note', 'call', 'email', 'whatsapp', 'meeting', 'stage_change'))
);
--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"quotation_version_id" uuid NOT NULL,
	"service_id" uuid,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"unit" text DEFAULT 'item' NOT NULL,
	"quantity" numeric(17, 4) DEFAULT '1' NOT NULL,
	"unit_price" numeric(17, 2) NOT NULL,
	"discount_amount" numeric(17, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(17, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(17, 2) NOT NULL,
	"tax_amount" numeric(17, 2) DEFAULT '0' NOT NULL,
	"total" numeric(17, 2) NOT NULL,
	CONSTRAINT "quotation_items_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "quotation_items_position_uq" UNIQUE("organization_id","quotation_version_id","position"),
	CONSTRAINT "quotation_items_values_check" CHECK ("quotation_items"."position" >= 0 and "quotation_items"."quantity" > 0 and "quotation_items"."unit_price" >= 0 and "quotation_items"."discount_amount" >= 0 and "quotation_items"."tax_rate" between 0 and 100 and "quotation_items"."tax_amount" >= 0),
	CONSTRAINT "quotation_items_math_check" CHECK ("quotation_items"."subtotal" = round("quotation_items"."quantity" * "quotation_items"."unit_price", 2) and "quotation_items"."discount_amount" <= "quotation_items"."subtotal" and "quotation_items"."tax_amount" = round(("quotation_items"."subtotal" - "quotation_items"."discount_amount") * "quotation_items"."tax_rate" / 100, 2) and "quotation_items"."total" = "quotation_items"."subtotal" - "quotation_items"."discount_amount" + "quotation_items"."tax_amount")
);
--> statement-breakpoint
CREATE TABLE "quotation_payment_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"quotation_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(17, 2) NOT NULL,
	"due_at" timestamp with time zone,
	"trigger" text,
	CONSTRAINT "quotation_payment_schedules_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "quotation_payment_schedules_position_uq" UNIQUE("organization_id","quotation_version_id","position"),
	CONSTRAINT "quotation_payment_schedules_amount_check" CHECK ("quotation_payment_schedules"."amount" > 0 and "quotation_payment_schedules"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quotation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"quotation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"customer_snapshot" jsonb NOT NULL,
	"issuer_snapshot" jsonb NOT NULL,
	"scope" text NOT NULL,
	"deliverables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exclusions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"terms" text NOT NULL,
	"currency" text DEFAULT 'UGX' NOT NULL,
	"subtotal" numeric(17, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(17, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(17, 2) DEFAULT '0' NOT NULL,
	"total" numeric(17, 2) DEFAULT '0' NOT NULL,
	"valid_until" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"accepted_by_name" text,
	"declined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_versions_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "quotation_versions_revision_uq" UNIQUE("organization_id","quotation_id","version"),
	CONSTRAINT "quotation_versions_status_check" CHECK ("quotation_versions"."status" in ('draft', 'sent', 'accepted', 'declined', 'expired', 'superseded')),
	CONSTRAINT "quotation_versions_currency_check" CHECK ("quotation_versions"."currency" in ('UGX', 'USD')),
	CONSTRAINT "quotation_versions_revision_check" CHECK ("quotation_versions"."version" > 0),
	CONSTRAINT "quotation_versions_amounts_check" CHECK ("quotation_versions"."subtotal" >= 0 and "quotation_versions"."discount_amount" >= 0 and "quotation_versions"."discount_amount" <= "quotation_versions"."subtotal" and "quotation_versions"."tax_amount" >= 0 and "quotation_versions"."total" = "quotation_versions"."subtotal" - "quotation_versions"."discount_amount" + "quotation_versions"."tax_amount"),
	CONSTRAINT "quotation_versions_sent_check" CHECK ("quotation_versions"."status" = 'draft' or "quotation_versions"."sent_at" is not null),
	CONSTRAINT "quotation_versions_accepted_check" CHECK ("quotation_versions"."status" <> 'accepted' or ("quotation_versions"."accepted_at" is not null and nullif(trim("quotation_versions"."accepted_by_name"), '') is not null)),
	CONSTRAINT "quotation_versions_arrays_check" CHECK (jsonb_typeof("quotation_versions"."deliverables") = 'array' and jsonb_typeof("quotation_versions"."exclusions") = 'array')
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"number" text,
	"title" text NOT NULL,
	"division" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotations_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "quotations_number_org_uq" UNIQUE("organization_id","number"),
	CONSTRAINT "quotations_division_check" CHECK ("quotations"."division" in ('estates', 'architecture', 'painting', 'interiors', 'tech'))
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"responsibility" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "project_members_staff_uq" UNIQUE("organization_id","project_id","staff_id")
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"client_approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_milestones_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "project_milestones_project_id_uq" UNIQUE("organization_id","project_id","id"),
	CONSTRAINT "project_milestones_position_uq" UNIQUE("organization_id","project_id","position"),
	CONSTRAINT "project_milestones_status_check" CHECK ("project_milestones"."status" in ('pending', 'in_progress', 'awaiting_approval', 'completed', 'cancelled')),
	CONSTRAINT "project_milestones_position_check" CHECK ("project_milestones"."position" >= 0),
	CONSTRAINT "project_milestones_completed_check" CHECK ("project_milestones"."status" <> 'completed' or "project_milestones"."completed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"quotation_version_id" uuid,
	"manager_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"division" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"scope" text,
	"starts_on" date,
	"due_on" date,
	"completed_at" timestamp with time zone,
	"budget" numeric(17, 2),
	"currency" text DEFAULT 'UGX' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "projects_code_org_uq" UNIQUE("organization_id","code"),
	CONSTRAINT "projects_status_check" CHECK ("projects"."status" in ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
	CONSTRAINT "projects_division_check" CHECK ("projects"."division" in ('estates', 'architecture', 'painting', 'interiors', 'tech')),
	CONSTRAINT "projects_currency_check" CHECK ("projects"."currency" in ('UGX', 'USD')),
	CONSTRAINT "projects_budget_check" CHECK ("projects"."budget" is null or "projects"."budget" >= 0),
	CONSTRAINT "projects_dates_check" CHECK ("projects"."starts_on" is null or "projects"."due_on" is null or "projects"."due_on" >= "projects"."starts_on"),
	CONSTRAINT "projects_completed_check" CHECK ("projects"."status" <> 'completed' or "projects"."completed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_comments_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" uuid,
	"milestone_id" uuid,
	"opportunity_id" uuid,
	"assignee_id" uuid,
	"created_by_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('todo', 'in_progress', 'blocked', 'completed', 'cancelled')),
	CONSTRAINT "tasks_priority_check" CHECK ("tasks"."priority" in ('low', 'normal', 'high', 'urgent')),
	CONSTRAINT "tasks_milestone_project_check" CHECK ("tasks"."milestone_id" is null or "tasks"."project_id" is not null),
	CONSTRAINT "tasks_completed_check" CHECK ("tasks"."status" <> 'completed' or "tasks"."completed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "credit_note_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"credit_note_id" uuid NOT NULL,
	"service_id" uuid,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"unit" text DEFAULT 'item' NOT NULL,
	"quantity" numeric(17, 4) DEFAULT '1' NOT NULL,
	"unit_price" numeric(17, 2) NOT NULL,
	"discount_amount" numeric(17, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(17, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(17, 2) NOT NULL,
	"tax_amount" numeric(17, 2) DEFAULT '0' NOT NULL,
	"total" numeric(17, 2) NOT NULL,
	CONSTRAINT "credit_note_items_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "credit_note_items_position_uq" UNIQUE("organization_id","credit_note_id","position"),
	CONSTRAINT "credit_note_items_values_check" CHECK ("credit_note_items"."position" >= 0 and "credit_note_items"."quantity" > 0 and "credit_note_items"."unit_price" >= 0 and "credit_note_items"."discount_amount" >= 0 and "credit_note_items"."tax_rate" between 0 and 100 and "credit_note_items"."tax_amount" >= 0),
	CONSTRAINT "credit_note_items_math_check" CHECK ("credit_note_items"."subtotal" = round("credit_note_items"."quantity" * "credit_note_items"."unit_price", 2) and "credit_note_items"."discount_amount" <= "credit_note_items"."subtotal" and "credit_note_items"."tax_amount" = round(("credit_note_items"."subtotal" - "credit_note_items"."discount_amount") * "credit_note_items"."tax_rate" / 100, 2) and "credit_note_items"."total" = "credit_note_items"."subtotal" - "credit_note_items"."discount_amount" + "credit_note_items"."tax_amount")
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"reason" text NOT NULL,
	"currency" text DEFAULT 'UGX' NOT NULL,
	"subtotal" numeric(17, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(17, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(17, 2) DEFAULT '0' NOT NULL,
	"total" numeric(17, 2) DEFAULT '0' NOT NULL,
	"issued_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "credit_notes_org_client_currency_uq" UNIQUE("organization_id","id","client_id","currency"),
	CONSTRAINT "credit_notes_number_org_uq" UNIQUE("organization_id","number"),
	CONSTRAINT "credit_notes_status_check" CHECK ("credit_notes"."status" in ('draft', 'issued', 'void')),
	CONSTRAINT "credit_notes_currency_check" CHECK ("credit_notes"."currency" in ('UGX', 'USD')),
	CONSTRAINT "credit_notes_amounts_check" CHECK ("credit_notes"."subtotal" >= 0 and "credit_notes"."discount_amount" between 0 and "credit_notes"."subtotal" and "credit_notes"."tax_amount" >= 0 and "credit_notes"."total" = "credit_notes"."subtotal" - "credit_notes"."discount_amount" + "credit_notes"."tax_amount"),
	CONSTRAINT "credit_notes_issued_check" CHECK ("credit_notes"."status" = 'draft' or ("credit_notes"."number" is not null and "credit_notes"."issued_at" is not null and "credit_notes"."total" > 0)),
	CONSTRAINT "credit_notes_void_check" CHECK ("credit_notes"."status" <> 'void' or "credit_notes"."voided_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"service_id" uuid,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"unit" text DEFAULT 'item' NOT NULL,
	"quantity" numeric(17, 4) DEFAULT '1' NOT NULL,
	"unit_price" numeric(17, 2) NOT NULL,
	"discount_amount" numeric(17, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(17, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(17, 2) NOT NULL,
	"tax_amount" numeric(17, 2) DEFAULT '0' NOT NULL,
	"total" numeric(17, 2) NOT NULL,
	CONSTRAINT "invoice_items_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "invoice_items_position_uq" UNIQUE("organization_id","invoice_id","position"),
	CONSTRAINT "invoice_items_values_check" CHECK ("invoice_items"."position" >= 0 and "invoice_items"."quantity" > 0 and "invoice_items"."unit_price" >= 0 and "invoice_items"."discount_amount" >= 0 and "invoice_items"."tax_rate" between 0 and 100 and "invoice_items"."tax_amount" >= 0),
	CONSTRAINT "invoice_items_math_check" CHECK ("invoice_items"."subtotal" = round("invoice_items"."quantity" * "invoice_items"."unit_price", 2) and "invoice_items"."discount_amount" <= "invoice_items"."subtotal" and "invoice_items"."tax_amount" = round(("invoice_items"."subtotal" - "invoice_items"."discount_amount") * "invoice_items"."tax_rate" / 100, 2) and "invoice_items"."total" = "invoice_items"."subtotal" - "invoice_items"."discount_amount" + "invoice_items"."tax_amount")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"quotation_version_id" uuid,
	"number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"customer_snapshot" jsonb NOT NULL,
	"issuer_snapshot" jsonb NOT NULL,
	"currency" text DEFAULT 'UGX' NOT NULL,
	"subtotal" numeric(17, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(17, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(17, 2) DEFAULT '0' NOT NULL,
	"total" numeric(17, 2) DEFAULT '0' NOT NULL,
	"issued_at" timestamp with time zone,
	"due_on" date,
	"notes" text,
	"terms" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "invoices_org_client_currency_uq" UNIQUE("organization_id","id","client_id","currency"),
	CONSTRAINT "invoices_number_org_uq" UNIQUE("organization_id","number"),
	CONSTRAINT "invoices_status_check" CHECK ("invoices"."status" in ('draft', 'issued', 'void')),
	CONSTRAINT "invoices_currency_check" CHECK ("invoices"."currency" in ('UGX', 'USD')),
	CONSTRAINT "invoices_amounts_check" CHECK ("invoices"."subtotal" >= 0 and "invoices"."discount_amount" >= 0 and "invoices"."discount_amount" <= "invoices"."subtotal" and "invoices"."tax_amount" >= 0 and "invoices"."total" = "invoices"."subtotal" - "invoices"."discount_amount" + "invoices"."tax_amount"),
	CONSTRAINT "invoices_issued_check" CHECK ("invoices"."status" = 'draft' or (nullif(trim("invoices"."number"), '') is not null and "invoices"."issued_at" is not null and "invoices"."total" > 0)),
	CONSTRAINT "invoices_void_check" CHECK ("invoices"."status" <> 'void' or ("invoices"."voided_at" is not null and nullif(trim("invoices"."void_reason"), '') is not null))
);
--> statement-breakpoint
CREATE TABLE "payment_allocation_reversals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"payment_id" uuid NOT NULL,
	"allocation_id" uuid NOT NULL,
	"refund_id" uuid NOT NULL,
	"amount" numeric(17, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocation_reversals_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "payment_allocation_reversals_refund_allocation_uq" UNIQUE("organization_id","refund_id","allocation_id"),
	CONSTRAINT "payment_allocation_reversals_amount_check" CHECK ("payment_allocation_reversals"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"payment_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(17, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocations_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "payment_allocations_payment_id_uq" UNIQUE("organization_id","id","payment_id"),
	CONSTRAINT "payment_allocations_invoice_payment_uq" UNIQUE("organization_id","payment_id","invoice_id"),
	CONSTRAINT "payment_allocations_amount_check" CHECK ("payment_allocations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"payment_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"credit_note_id" uuid,
	"amount" numeric(17, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"reference" text,
	"idempotency_key" text NOT NULL,
	"completed_at" timestamp with time zone,
	"processed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "payment_refunds_payment_id_uq" UNIQUE("organization_id","id","payment_id"),
	CONSTRAINT "payment_refunds_idempotency_uq" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "payment_refunds_status_check" CHECK ("payment_refunds"."status" in ('pending', 'completed', 'cancelled')),
	CONSTRAINT "payment_refunds_amount_check" CHECK ("payment_refunds"."amount" > 0),
	CONSTRAINT "payment_refunds_completed_check" CHECK ("payment_refunds"."status" <> 'completed' or ("payment_refunds"."completed_at" is not null and "payment_refunds"."processed_by_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"amount" numeric(17, 2) NOT NULL,
	"currency" text DEFAULT 'UGX' NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"provider" text,
	"provider_transaction_id" text,
	"reference" text,
	"idempotency_key" text NOT NULL,
	"receipt_number" text,
	"received_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_id" uuid,
	"rejection_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "payments_org_client_currency_uq" UNIQUE("organization_id","id","client_id","currency"),
	CONSTRAINT "payments_idempotency_org_uq" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "payments_receipt_org_uq" UNIQUE("organization_id","receipt_number"),
	CONSTRAINT "payments_provider_transaction_org_uq" UNIQUE("organization_id","provider","provider_transaction_id"),
	CONSTRAINT "payments_method_check" CHECK ("payments"."method" in ('mobile_money', 'bank_transfer', 'cash', 'other')),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" in ('submitted', 'confirmed', 'rejected')),
	CONSTRAINT "payments_currency_check" CHECK ("payments"."currency" in ('UGX', 'USD')),
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_confirmed_check" CHECK ("payments"."status" <> 'confirmed' or ("payments"."confirmed_at" is not null and "payments"."confirmed_by_id" is not null and "payments"."receipt_number" is not null)),
	CONSTRAINT "payments_provider_reference_check" CHECK ("payments"."provider_transaction_id" is null or "payments"."provider" is not null)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"supplier_id" uuid,
	"project_id" uuid,
	"division" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"net_amount" numeric(17, 2) NOT NULL,
	"tax_amount" numeric(17, 2) DEFAULT '0' NOT NULL,
	"total" numeric(17, 2) NOT NULL,
	"currency" text DEFAULT 'UGX' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"incurred_at" timestamp with time zone NOT NULL,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payment_reference" text,
	"supplier_invoice_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "expenses_status_check" CHECK ("expenses"."status" in ('draft', 'submitted', 'approved', 'paid', 'rejected', 'void')),
	CONSTRAINT "expenses_division_check" CHECK ("expenses"."division" in ('estates', 'architecture', 'painting', 'interiors', 'tech')),
	CONSTRAINT "expenses_currency_check" CHECK ("expenses"."currency" in ('UGX', 'USD')),
	CONSTRAINT "expenses_amounts_check" CHECK ("expenses"."net_amount" >= 0 and "expenses"."tax_amount" >= 0 and "expenses"."total" > 0 and "expenses"."total" = "expenses"."net_amount" + "expenses"."tax_amount"),
	CONSTRAINT "expenses_approval_check" CHECK ("expenses"."status" not in ('approved', 'paid') or ("expenses"."approved_by_id" is not null and "expenses"."approved_at" is not null)),
	CONSTRAINT "expenses_paid_check" CHECK ("expenses"."status" <> 'paid' or "expenses"."paid_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"tax_identifier" text,
	"address" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"owner_client_id" uuid,
	"manager_id" uuid,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"property_type" text NOT NULL,
	"transaction_type" text DEFAULT 'sale' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"location" text NOT NULL,
	"description" text,
	"asking_price" numeric(17, 2),
	"currency" text DEFAULT 'UGX' NOT NULL,
	"bedrooms" integer,
	"bathrooms" integer,
	"area_square_metres" numeric(17, 2),
	"sanity_document_id" text,
	"verified_at" timestamp with time zone,
	"verified_by_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "properties_code_org_uq" UNIQUE("organization_id","code"),
	CONSTRAINT "properties_sanity_org_uq" UNIQUE("organization_id","sanity_document_id"),
	CONSTRAINT "properties_transactionType_check" CHECK ("properties"."transaction_type" in ('sale', 'rent')),
	CONSTRAINT "properties_status_check" CHECK ("properties"."status" in ('draft', 'available', 'reserved', 'sold', 'let', 'withdrawn')),
	CONSTRAINT "properties_currency_check" CHECK ("properties"."currency" in ('UGX', 'USD')),
	CONSTRAINT "properties_dimensions_check" CHECK (("properties"."bedrooms" is null or "properties"."bedrooms" >= 0) and ("properties"."bathrooms" is null or "properties"."bathrooms" >= 0) and ("properties"."area_square_metres" is null or "properties"."area_square_metres" > 0)),
	CONSTRAINT "properties_price_check" CHECK ("properties"."asking_price" is null or "properties"."asking_price" > 0)
);
--> statement-breakpoint
CREATE TABLE "property_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"payer_client_id" uuid NOT NULL,
	"invoice_id" uuid,
	"agreement_reference" text NOT NULL,
	"agreement_terms" text NOT NULL,
	"expected_amount" numeric(17, 2) NOT NULL,
	"currency" text DEFAULT 'UGX' NOT NULL,
	"status" text DEFAULT 'agreed' NOT NULL,
	"earned_at" timestamp with time zone,
	"protection_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_commissions_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "property_commissions_status_check" CHECK ("property_commissions"."status" in ('agreed', 'earned', 'invoiced', 'cancelled')),
	CONSTRAINT "property_commissions_currency_check" CHECK ("property_commissions"."currency" in ('UGX', 'USD')),
	CONSTRAINT "property_commissions_amount_check" CHECK ("property_commissions"."expected_amount" > 0),
	CONSTRAINT "property_commissions_invoice_check" CHECK ("property_commissions"."status" <> 'invoiced' or "property_commissions"."invoice_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "property_viewings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"advisor_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_viewings_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "property_viewings_status_check" CHECK ("property_viewings"."status" in ('scheduled', 'completed', 'cancelled', 'no_show')),
	CONSTRAINT "property_viewings_dates_check" CHECK ("property_viewings"."ends_at" is null or "property_viewings"."ends_at" > "property_viewings"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "document_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"client_id" uuid,
	"opportunity_id" uuid,
	"quotation_version_id" uuid,
	"invoice_id" uuid,
	"project_id" uuid,
	"task_id" uuid,
	"expense_id" uuid,
	"property_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_links_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "document_links_one_parent_check" CHECK (num_nonnulls("document_links"."client_id", "document_links"."opportunity_id", "document_links"."quotation_version_id", "document_links"."invoice_id", "document_links"."project_id", "document_links"."task_id", "document_links"."expense_id", "document_links"."property_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "document_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"recipient_email" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_shares_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "document_shares_token_uq" UNIQUE("token_hash"),
	CONSTRAINT "document_shares_expiry_check" CHECK ("document_shares"."expires_at" > "document_shares"."created_at")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_document_id" uuid,
	"created_by_clerk_user_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "documents_storage_org_uq" UNIQUE("organization_id","storage_key"),
	CONSTRAINT "documents_kind_check" CHECK ("documents"."kind" in ('contract', 'quotation', 'invoice', 'receipt', 'drawing', 'brief', 'expense_receipt', 'property_document', 'other')),
	CONSTRAINT "documents_size_version_check" CHECK ("documents"."size_bytes" >= 0 and "documents"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "ai_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"trigger_message_id" uuid NOT NULL,
	"reply_message_id" uuid,
	"model" text NOT NULL,
	"policy_version" text NOT NULL,
	"knowledge_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"scope_approved" boolean DEFAULT false NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_agent_runs_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "ai_agent_runs_trigger_uq" UNIQUE("organization_id","trigger_message_id"),
	CONSTRAINT "ai_agent_runs_status_check" CHECK ("ai_agent_runs"."status" in ('queued', 'running', 'completed', 'blocked', 'failed')),
	CONSTRAINT "ai_agent_runs_tokens_check" CHECK (("ai_agent_runs"."input_tokens" is null or "ai_agent_runs"."input_tokens" >= 0) and ("ai_agent_runs"."output_tokens" is null or "ai_agent_runs"."output_tokens" >= 0)),
	CONSTRAINT "ai_agent_runs_completed_check" CHECK ("ai_agent_runs"."status" <> 'completed' or ("ai_agent_runs"."scope_approved" = true and "ai_agent_runs"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"whatsapp_message_id" uuid,
	"direction" text NOT NULL,
	"author_clerk_user_id" text,
	"author_kind" text NOT NULL,
	"body" text,
	"external_message_id" text,
	"idempotency_key" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_messages_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "conversation_messages_conversation_id_uq" UNIQUE("organization_id","conversation_id","id"),
	CONSTRAINT "conversation_messages_whatsapp_uq" UNIQUE("whatsapp_message_id"),
	CONSTRAINT "conversation_messages_idempotency_uq" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "conversation_messages_direction_check" CHECK ("conversation_messages"."direction" in ('inbound', 'outbound', 'internal')),
	CONSTRAINT "conversation_messages_authorKind_check" CHECK ("conversation_messages"."author_kind" in ('customer', 'staff', 'ai', 'system'))
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" uuid,
	"opportunity_id" uuid,
	"assigned_to_id" uuid,
	"channel" text NOT NULL,
	"external_address" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"handling_mode" text DEFAULT 'human' NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "conversations_channel_check" CHECK ("conversations"."channel" in ('whatsapp', 'email', 'manual')),
	CONSTRAINT "conversations_status_check" CHECK ("conversations"."status" in ('open', 'waiting', 'closed')),
	CONSTRAINT "conversations_handlingMode_check" CHECK ("conversations"."handling_mode" in ('ai', 'human', 'paused')),
	CONSTRAINT "conversations_closed_check" CHECK ("conversations"."status" <> 'closed' or "conversations"."closed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "crm_source_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" uuid,
	"opportunity_id" uuid,
	"invoice_id" uuid,
	"lead_id" uuid,
	"real_estate_enquiry_id" uuid,
	"property_lead_id" uuid,
	"design_purchase_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_source_links_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "crm_source_links_lead_uq" UNIQUE("lead_id"),
	CONSTRAINT "crm_source_links_estate_uq" UNIQUE("real_estate_enquiry_id"),
	CONSTRAINT "crm_source_links_property_uq" UNIQUE("property_lead_id"),
	CONSTRAINT "crm_source_links_purchase_uq" UNIQUE("design_purchase_id"),
	CONSTRAINT "crm_source_links_one_source_check" CHECK (num_nonnulls("crm_source_links"."lead_id", "crm_source_links"."real_estate_enquiry_id", "crm_source_links"."property_lead_id", "crm_source_links"."design_purchase_id") = 1),
	CONSTRAINT "crm_source_links_destination_check" CHECK (num_nonnulls("crm_source_links"."client_id", "crm_source_links"."opportunity_id", "crm_source_links"."invoice_id") >= 1)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"actor_clerk_user_id" text,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"changes" jsonb,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "audit_logs_actorType_check" CHECK ("audit_logs"."actor_type" in ('staff', 'customer', 'system'))
);
--> statement-breakpoint
CREATE TABLE "automation_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"lease_expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_outbox_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "automation_outbox_idempotency_uq" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "automation_outbox_status_check" CHECK ("automation_outbox"."status" in ('pending', 'processing', 'completed', 'failed', 'dead')),
	CONSTRAINT "automation_outbox_attempts_check" CHECK ("automation_outbox"."attempts" >= 0),
	CONSTRAINT "automation_outbox_lease_check" CHECK ("automation_outbox"."status" <> 'processing' or ("automation_outbox"."locked_at" is not null and "automation_outbox"."locked_by" is not null and "automation_outbox"."lease_expires_at" > "automation_outbox"."locked_at")),
	CONSTRAINT "automation_outbox_completed_check" CHECK ("automation_outbox"."status" <> 'completed' or "automation_outbox"."completed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "design_purchases" DROP CONSTRAINT "design_purchases_payment_method_check";--> statement-breakpoint
ALTER TABLE "design_purchases" DROP CONSTRAINT "design_purchases_payment_status_check";--> statement-breakpoint
ALTER TABLE "design_purchases" DROP CONSTRAINT "design_purchases_access_status_check";--> statement-breakpoint
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_ownerId_fk" FOREIGN KEY ("organization_id","owner_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_activities" ADD CONSTRAINT "opportunity_activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_activities" ADD CONSTRAINT "opportunity_activities_opportunityId_fk" FOREIGN KEY ("organization_id","opportunity_id") REFERENCES "public"."opportunities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_activities" ADD CONSTRAINT "opportunity_activities_actorId_fk" FOREIGN KEY ("organization_id","actor_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotationVersionId_fk" FOREIGN KEY ("organization_id","quotation_version_id") REFERENCES "public"."quotation_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_serviceId_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "public"."services"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_payment_schedules" ADD CONSTRAINT "quotation_payment_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_payment_schedules" ADD CONSTRAINT "quotation_payment_schedules_quotationVersionId_fk" FOREIGN KEY ("organization_id","quotation_version_id") REFERENCES "public"."quotation_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_quotationId_fk" FOREIGN KEY ("organization_id","quotation_id") REFERENCES "public"."quotations"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_opportunityId_fk" FOREIGN KEY ("organization_id","opportunity_id") REFERENCES "public"."opportunities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_staffId_fk" FOREIGN KEY ("organization_id","staff_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_projectId_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_quotationVersionId_fk" FOREIGN KEY ("organization_id","quotation_version_id") REFERENCES "public"."quotation_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_managerId_fk" FOREIGN KEY ("organization_id","manager_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_taskId_fk" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_authorId_fk" FOREIGN KEY ("organization_id","author_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_project_fk" FOREIGN KEY ("organization_id","project_id","milestone_id") REFERENCES "public"."project_milestones"("organization_id","project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunityId_fk" FOREIGN KEY ("organization_id","opportunity_id") REFERENCES "public"."opportunities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fk" FOREIGN KEY ("organization_id","assignee_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fk" FOREIGN KEY ("organization_id","created_by_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_creditNoteId_fk" FOREIGN KEY ("organization_id","credit_note_id") REFERENCES "public"."credit_notes"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_serviceId_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "public"."services"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_client_currency_fk" FOREIGN KEY ("organization_id","invoice_id","client_id","currency") REFERENCES "public"."invoices"("organization_id","id","client_id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_serviceId_fk" FOREIGN KEY ("organization_id","service_id") REFERENCES "public"."services"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_projectId_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quotationVersionId_fk" FOREIGN KEY ("organization_id","quotation_version_id") REFERENCES "public"."quotation_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_allocation_payment_fk" FOREIGN KEY ("organization_id","allocation_id","payment_id") REFERENCES "public"."payment_allocations"("organization_id","id","payment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_refund_payment_fk" FOREIGN KEY ("organization_id","refund_id","payment_id") REFERENCES "public"."payment_refunds"("organization_id","id","payment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_client_currency_fk" FOREIGN KEY ("organization_id","payment_id","client_id","currency") REFERENCES "public"."payments"("organization_id","id","client_id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoiceId_client_currency_fk" FOREIGN KEY ("organization_id","invoice_id","client_id","currency") REFERENCES "public"."invoices"("organization_id","id","client_id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_paymentId_client_currency_fk" FOREIGN KEY ("organization_id","payment_id","client_id","currency") REFERENCES "public"."payments"("organization_id","id","client_id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_creditNoteId_client_currency_fk" FOREIGN KEY ("organization_id","credit_note_id","client_id","currency") REFERENCES "public"."credit_notes"("organization_id","id","client_id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_processedById_fk" FOREIGN KEY ("organization_id","processed_by_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmedById_fk" FOREIGN KEY ("organization_id","confirmed_by_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplierId_fk" FOREIGN KEY ("organization_id","supplier_id") REFERENCES "public"."suppliers"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_projectId_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approvedById_fk" FOREIGN KEY ("organization_id","approved_by_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_ownerClientId_fk" FOREIGN KEY ("organization_id","owner_client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_managerId_fk" FOREIGN KEY ("organization_id","manager_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_verifiedById_fk" FOREIGN KEY ("organization_id","verified_by_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_commissions" ADD CONSTRAINT "property_commissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_commissions" ADD CONSTRAINT "property_commissions_propertyId_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_commissions" ADD CONSTRAINT "property_commissions_opportunityId_fk" FOREIGN KEY ("organization_id","opportunity_id") REFERENCES "public"."opportunities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_commissions" ADD CONSTRAINT "property_commissions_payerClientId_fk" FOREIGN KEY ("organization_id","payer_client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_commissions" ADD CONSTRAINT "property_commissions_invoiceId_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_viewings" ADD CONSTRAINT "property_viewings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_viewings" ADD CONSTRAINT "property_viewings_propertyId_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_viewings" ADD CONSTRAINT "property_viewings_opportunityId_fk" FOREIGN KEY ("organization_id","opportunity_id") REFERENCES "public"."opportunities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_viewings" ADD CONSTRAINT "property_viewings_advisorId_fk" FOREIGN KEY ("organization_id","advisor_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_documentId_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_opportunityId_fk" FOREIGN KEY ("organization_id","opportunity_id") REFERENCES "public"."opportunities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_quotationVersionId_fk" FOREIGN KEY ("organization_id","quotation_version_id") REFERENCES "public"."quotation_versions"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_invoiceId_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_projectId_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_taskId_fk" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_expenseId_fk" FOREIGN KEY ("organization_id","expense_id") REFERENCES "public"."expenses"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_propertyId_fk" FOREIGN KEY ("organization_id","property_id") REFERENCES "public"."properties"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_documentId_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_supersedes_fk" FOREIGN KEY ("organization_id","supersedes_document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_runs" ADD CONSTRAINT "ai_agent_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_runs" ADD CONSTRAINT "ai_agent_runs_conversationId_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_runs" ADD CONSTRAINT "ai_agent_runs_triggerMessageId_conversation_fk" FOREIGN KEY ("organization_id","conversation_id","trigger_message_id") REFERENCES "public"."conversation_messages"("organization_id","conversation_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_runs" ADD CONSTRAINT "ai_agent_runs_replyMessageId_conversation_fk" FOREIGN KEY ("organization_id","conversation_id","reply_message_id") REFERENCES "public"."conversation_messages"("organization_id","conversation_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_whatsapp_message_id_whatsapp_messages_id_fk" FOREIGN KEY ("whatsapp_message_id") REFERENCES "public"."whatsapp_messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversationId_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_opportunityId_fk" FOREIGN KEY ("organization_id","opportunity_id") REFERENCES "public"."opportunities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignedToId_fk" FOREIGN KEY ("organization_id","assigned_to_id") REFERENCES "public"."staff_memberships"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_source_links" ADD CONSTRAINT "crm_source_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_source_links" ADD CONSTRAINT "crm_source_links_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_source_links" ADD CONSTRAINT "crm_source_links_real_estate_enquiry_id_real_estate_enquiries_id_fk" FOREIGN KEY ("real_estate_enquiry_id") REFERENCES "public"."real_estate_enquiries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_source_links" ADD CONSTRAINT "crm_source_links_property_lead_id_property_leads_id_fk" FOREIGN KEY ("property_lead_id") REFERENCES "public"."property_leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_source_links" ADD CONSTRAINT "crm_source_links_design_purchase_id_design_purchases_id_fk" FOREIGN KEY ("design_purchase_id") REFERENCES "public"."design_purchases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_source_links" ADD CONSTRAINT "crm_source_links_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_source_links" ADD CONSTRAINT "crm_source_links_opportunityId_fk" FOREIGN KEY ("organization_id","opportunity_id") REFERENCES "public"."opportunities"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_source_links" ADD CONSTRAINT "crm_source_links_invoiceId_fk" FOREIGN KEY ("organization_id","invoice_id") REFERENCES "public"."invoices"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_outbox" ADD CONSTRAINT "automation_outbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_memberships_org_status_idx" ON "staff_memberships" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "client_contacts_primary_uq" ON "client_contacts" USING btree ("organization_id","client_id") WHERE "client_contacts"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("organization_id","client_id");--> statement-breakpoint
CREATE INDEX "client_contacts_phone_idx" ON "client_contacts" USING btree ("organization_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_clerk_org_uq" ON "clients" USING btree ("organization_id","clerk_user_id") WHERE "clients"."clerk_user_id" is not null;--> statement-breakpoint
CREATE INDEX "clients_org_name_idx" ON "clients" USING btree ("organization_id","display_name");--> statement-breakpoint
CREATE INDEX "services_org_division_idx" ON "services" USING btree ("organization_id","division");--> statement-breakpoint
CREATE INDEX "opportunities_pipeline_idx" ON "opportunities" USING btree ("organization_id","division","stage");--> statement-breakpoint
CREATE INDEX "opportunities_followup_idx" ON "opportunities" USING btree ("organization_id","owner_id","next_follow_up_at");--> statement-breakpoint
CREATE INDEX "opportunity_activities_timeline_idx" ON "opportunity_activities" USING btree ("organization_id","opportunity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "quotation_versions_status_idx" ON "quotation_versions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_versions_accepted_uq" ON "quotation_versions" USING btree ("organization_id","quotation_id") WHERE "quotation_versions"."status" = 'accepted';--> statement-breakpoint
CREATE INDEX "quotations_client_idx" ON "quotations" USING btree ("organization_id","client_id");--> statement-breakpoint
CREATE INDEX "project_members_staff_idx" ON "project_members" USING btree ("organization_id","staff_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("organization_id","division","status");--> statement-breakpoint
CREATE INDEX "task_comments_timeline_idx" ON "task_comments" USING btree ("organization_id","task_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_assignee_due_idx" ON "tasks" USING btree ("organization_id","assignee_id","status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_idx" ON "credit_notes" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_status_due_idx" ON "invoices" USING btree ("organization_id","status","due_on");--> statement-breakpoint
CREATE INDEX "invoices_client_idx" ON "invoices" USING btree ("organization_id","client_id");--> statement-breakpoint
CREATE INDEX "payment_allocation_reversals_allocation_idx" ON "payment_allocation_reversals" USING btree ("organization_id","allocation_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE INDEX "payment_refunds_payment_idx" ON "payment_refunds" USING btree ("organization_id","payment_id");--> statement-breakpoint
CREATE INDEX "payments_client_received_idx" ON "payments" USING btree ("organization_id","client_id","received_at");--> statement-breakpoint
CREATE INDEX "expenses_division_incurred_idx" ON "expenses" USING btree ("organization_id","division","incurred_at");--> statement-breakpoint
CREATE INDEX "expenses_project_idx" ON "expenses" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "suppliers_org_name_idx" ON "suppliers" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "properties_status_location_idx" ON "properties" USING btree ("organization_id","status","location");--> statement-breakpoint
CREATE INDEX "property_commissions_status_idx" ON "property_commissions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "property_viewings_schedule_idx" ON "property_viewings" USING btree ("organization_id","advisor_id","starts_at");--> statement-breakpoint
CREATE INDEX "document_links_document_idx" ON "document_links" USING btree ("organization_id","document_id");--> statement-breakpoint
CREATE INDEX "documents_kind_created_idx" ON "documents" USING btree ("organization_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "ai_agent_runs_queue_idx" ON "ai_agent_runs" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "conversation_messages_timeline_idx" ON "conversation_messages" USING btree ("organization_id","conversation_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_active_address_uq" ON "conversations" USING btree ("organization_id","channel","external_address") WHERE "conversations"."status" in ('open', 'waiting');--> statement-breakpoint
CREATE INDEX "conversations_inbox_idx" ON "conversations" USING btree ("organization_id","status","last_activity_at");--> statement-breakpoint
CREATE INDEX "crm_source_links_opportunity_idx" ON "crm_source_links" USING btree ("organization_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("organization_id","entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_outbox_queue_idx" ON "automation_outbox" USING btree ("status","available_at");--> statement-breakpoint
ALTER TABLE "design_purchases" ADD CONSTRAINT "design_purchases_payment_method_check" CHECK (

        "design_purchases"."payment_method" is null or

        "design_purchases"."payment_method" in (

          'mobile_money',

          'bank_transfer',

          'cash',

          'other'

        )

      );--> statement-breakpoint
ALTER TABLE "design_purchases" ADD CONSTRAINT "design_purchases_payment_status_check" CHECK (

        "design_purchases"."payment_status" in (

          'pending',

          'submitted',

          'confirmed',

          'rejected'

        )

      );--> statement-breakpoint
ALTER TABLE "design_purchases" ADD CONSTRAINT "design_purchases_access_status_check" CHECK (

        "design_purchases"."access_status" in (

          'pending',

          'active',

          'revoked'

        )

      );