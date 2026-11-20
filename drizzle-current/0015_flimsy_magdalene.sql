ALTER TABLE "project_members" ALTER COLUMN "staff_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN "external_name" text;--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN "external_company" text;--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN "external_phone" text;--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN "external_email" text;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_identity_check" CHECK (("project_members"."staff_id" is not null and "project_members"."external_name" is null and "project_members"."external_company" is null and "project_members"."external_phone" is null and "project_members"."external_email" is null) or ("project_members"."staff_id" is null and nullif(trim("project_members"."external_name"), '') is not null));