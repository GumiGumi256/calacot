-- Catalog-derived repair of missing 0009 baseline constraints only.

-- Review and approve production execution; take a recovery point first.

-- No DROP, CASCADE, row changes or sales issuance. Existing constraints are untouched.

BEGIN;

SET LOCAL lock_timeout='5s';

SET LOCAL statement_timeout='60s';

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."staff_memberships"'::regclass AND conname='staff_memberships_org_id_uq') THEN ALTER TABLE public."staff_memberships" ADD CONSTRAINT "staff_memberships_org_id_uq" UNIQUE ("organization_id","id"); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."staff_memberships"'::regclass AND conname='staff_memberships_clerk_org_uq') THEN ALTER TABLE public."staff_memberships" ADD CONSTRAINT "staff_memberships_clerk_org_uq" UNIQUE ("organization_id","clerk_user_id"); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."client_contacts"'::regclass AND conname='client_contacts_org_id_uq') THEN ALTER TABLE public."client_contacts" ADD CONSTRAINT "client_contacts_org_id_uq" UNIQUE ("organization_id","id"); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."clients"'::regclass AND conname='clients_org_id_uq') THEN ALTER TABLE public."clients" ADD CONSTRAINT "clients_org_id_uq" UNIQUE ("organization_id","id"); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."opportunity_activities"'::regclass AND conname='opportunity_activities_org_id_uq') THEN ALTER TABLE public."opportunity_activities" ADD CONSTRAINT "opportunity_activities_org_id_uq" UNIQUE ("organization_id","id"); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."quotation_items"'::regclass AND conname='quotation_items_org_id_uq') THEN ALTER TABLE public."quotation_items" ADD CONSTRAINT "quotation_items_org_id_uq" UNIQUE ("organization_id","id"); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."quotation_items"'::regclass AND conname='quotation_items_position_uq') THEN ALTER TABLE public."quotation_items" ADD CONSTRAINT "quotation_items_position_uq" UNIQUE ("organization_id","quotation_version_id","position"); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."quotation_payment_schedules"'::regclass AND conname='quotation_payment_schedules_org_id_uq') THEN ALTER TABLE public."quotation_payment_schedules" ADD CONSTRAINT "quotation_payment_schedules_org_id_uq" UNIQUE ("organization_id","id"); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."quotation_payment_schedules"'::regclass AND conname='quotation_payment_schedules_position_uq') THEN ALTER TABLE public."quotation_payment_schedules" ADD CONSTRAINT "quotation_payment_schedules_position_uq" UNIQUE ("organization_id","quotation_version_id","position"); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."quotation_versions"'::regclass AND conname='quotation_versions_org_id_uq') THEN ALTER TABLE public."quotation_versions" ADD CONSTRAINT "quotation_versions_org_id_uq" UNIQUE ("organization_id","id"); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."quotations"'::regclass AND conname='quotations_org_id_uq') THEN ALTER TABLE public."quotations" ADD CONSTRAINT "quotations_org_id_uq" UNIQUE ("organization_id","id"); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."quotations"'::regclass AND conname='quotations_number_org_uq') THEN ALTER TABLE public."quotations" ADD CONSTRAINT "quotations_number_org_uq" UNIQUE ("organization_id","number"); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."project_members"'::regclass AND conname='project_members_org_id_uq') THEN ALTER TABLE public."project_members" ADD CONSTRAINT "project_members_org_id_uq" UNIQUE ("organization_id","id"); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."client_contacts"'::regclass AND conname='client_contacts_clientId_fk') THEN ALTER TABLE public."client_contacts" ADD CONSTRAINT "client_contacts_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."opportunities"'::regclass AND conname='opportunities_clientId_fk') THEN ALTER TABLE public."opportunities" ADD CONSTRAINT "opportunities_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."opportunities"'::regclass AND conname='opportunities_ownerId_fk') THEN ALTER TABLE public."opportunities" ADD CONSTRAINT "opportunities_ownerId_fk" FOREIGN KEY ("organization_id","owner_id") REFERENCES "public"."staff_memberships" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."opportunity_activities"'::regclass AND conname='opportunity_activities_actorId_fk') THEN ALTER TABLE public."opportunity_activities" ADD CONSTRAINT "opportunity_activities_actorId_fk" FOREIGN KEY ("organization_id","actor_id") REFERENCES "public"."staff_memberships" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."quotation_items"'::regclass AND conname='quotation_items_quotationVersionId_fk') THEN ALTER TABLE public."quotation_items" ADD CONSTRAINT "quotation_items_quotationVersionId_fk" FOREIGN KEY ("organization_id","quotation_version_id") REFERENCES "public"."quotation_versions" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."quotation_payment_schedules"'::regclass AND conname='quotation_payment_schedules_quotationVersionId_fk') THEN ALTER TABLE public."quotation_payment_schedules" ADD CONSTRAINT "quotation_payment_schedules_quotationVersionId_fk" FOREIGN KEY ("organization_id","quotation_version_id") REFERENCES "public"."quotation_versions" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."quotation_versions"'::regclass AND conname='quotation_versions_quotationId_fk') THEN ALTER TABLE public."quotation_versions" ADD CONSTRAINT "quotation_versions_quotationId_fk" FOREIGN KEY ("organization_id","quotation_id") REFERENCES "public"."quotations" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."quotations"'::regclass AND conname='quotations_clientId_fk') THEN ALTER TABLE public."quotations" ADD CONSTRAINT "quotations_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."project_members"'::regclass AND conname='project_members_staffId_fk') THEN ALTER TABLE public."project_members" ADD CONSTRAINT "project_members_staffId_fk" FOREIGN KEY ("organization_id","staff_id") REFERENCES "public"."staff_memberships" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."projects"'::regclass AND conname='projects_clientId_fk') THEN ALTER TABLE public."projects" ADD CONSTRAINT "projects_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."projects"'::regclass AND conname='projects_quotationVersionId_fk') THEN ALTER TABLE public."projects" ADD CONSTRAINT "projects_quotationVersionId_fk" FOREIGN KEY ("organization_id","quotation_version_id") REFERENCES "public"."quotation_versions" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."projects"'::regclass AND conname='projects_managerId_fk') THEN ALTER TABLE public."projects" ADD CONSTRAINT "projects_managerId_fk" FOREIGN KEY ("organization_id","manager_id") REFERENCES "public"."staff_memberships" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."task_comments"'::regclass AND conname='task_comments_authorId_fk') THEN ALTER TABLE public."task_comments" ADD CONSTRAINT "task_comments_authorId_fk" FOREIGN KEY ("organization_id","author_id") REFERENCES "public"."staff_memberships" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."tasks"'::regclass AND conname='tasks_assigneeId_fk') THEN ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_assigneeId_fk" FOREIGN KEY ("organization_id","assignee_id") REFERENCES "public"."staff_memberships" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."tasks"'::regclass AND conname='tasks_createdById_fk') THEN ALTER TABLE public."tasks" ADD CONSTRAINT "tasks_createdById_fk" FOREIGN KEY ("organization_id","created_by_id") REFERENCES "public"."staff_memberships" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."invoices"'::regclass AND conname='invoices_clientId_fk') THEN ALTER TABLE public."invoices" ADD CONSTRAINT "invoices_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."invoices"'::regclass AND conname='invoices_quotationVersionId_fk') THEN ALTER TABLE public."invoices" ADD CONSTRAINT "invoices_quotationVersionId_fk" FOREIGN KEY ("organization_id","quotation_version_id") REFERENCES "public"."quotation_versions" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."payment_allocation_reversals"'::regclass AND conname=left('payment_allocation_reversals_organization_id_organizations_id_fk',63)) THEN ALTER TABLE public."payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id") ON DELETE no action ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."payment_refunds"'::regclass AND conname='payment_refunds_processedById_fk') THEN ALTER TABLE public."payment_refunds" ADD CONSTRAINT "payment_refunds_processedById_fk" FOREIGN KEY ("organization_id","processed_by_id") REFERENCES "public"."staff_memberships" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."payments"'::regclass AND conname='payments_clientId_fk') THEN ALTER TABLE public."payments" ADD CONSTRAINT "payments_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."payments"'::regclass AND conname='payments_confirmedById_fk') THEN ALTER TABLE public."payments" ADD CONSTRAINT "payments_confirmedById_fk" FOREIGN KEY ("organization_id","confirmed_by_id") REFERENCES "public"."staff_memberships" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."expenses"'::regclass AND conname='expenses_approvedById_fk') THEN ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_approvedById_fk" FOREIGN KEY ("organization_id","approved_by_id") REFERENCES "public"."staff_memberships" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."properties"'::regclass AND conname='properties_ownerClientId_fk') THEN ALTER TABLE public."properties" ADD CONSTRAINT "properties_ownerClientId_fk" FOREIGN KEY ("organization_id","owner_client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."properties"'::regclass AND conname='properties_managerId_fk') THEN ALTER TABLE public."properties" ADD CONSTRAINT "properties_managerId_fk" FOREIGN KEY ("organization_id","manager_id") REFERENCES "public"."staff_memberships" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."properties"'::regclass AND conname='properties_verifiedById_fk') THEN ALTER TABLE public."properties" ADD CONSTRAINT "properties_verifiedById_fk" FOREIGN KEY ("organization_id","verified_by_id") REFERENCES "public"."staff_memberships" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."property_commissions"'::regclass AND conname='property_commissions_payerClientId_fk') THEN ALTER TABLE public."property_commissions" ADD CONSTRAINT "property_commissions_payerClientId_fk" FOREIGN KEY ("organization_id","payer_client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."property_viewings"'::regclass AND conname='property_viewings_advisorId_fk') THEN ALTER TABLE public."property_viewings" ADD CONSTRAINT "property_viewings_advisorId_fk" FOREIGN KEY ("organization_id","advisor_id") REFERENCES "public"."staff_memberships" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."document_links"'::regclass AND conname='document_links_clientId_fk') THEN ALTER TABLE public."document_links" ADD CONSTRAINT "document_links_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."document_links"'::regclass AND conname='document_links_quotationVersionId_fk') THEN ALTER TABLE public."document_links" ADD CONSTRAINT "document_links_quotationVersionId_fk" FOREIGN KEY ("organization_id","quotation_version_id") REFERENCES "public"."quotation_versions" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."conversation_messages"'::regclass AND conname=left('conversation_messages_whatsapp_message_id_whatsapp_messages_id_fk',63)) THEN ALTER TABLE public."conversation_messages" ADD CONSTRAINT "conversation_messages_whatsapp_message_id_whatsapp_messages_id_fk" FOREIGN KEY ("whatsapp_message_id") REFERENCES "public"."whatsapp_messages" ("id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."conversations"'::regclass AND conname='conversations_clientId_fk') THEN ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."conversations"'::regclass AND conname='conversations_assignedToId_fk') THEN ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_assignedToId_fk" FOREIGN KEY ("organization_id","assigned_to_id") REFERENCES "public"."staff_memberships" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."crm_source_links"'::regclass AND conname=left('crm_source_links_real_estate_enquiry_id_real_estate_enquiries_id_fk',63)) THEN ALTER TABLE public."crm_source_links" ADD CONSTRAINT "crm_source_links_real_estate_enquiry_id_real_estate_enquiries_id_fk" FOREIGN KEY ("real_estate_enquiry_id") REFERENCES "public"."real_estate_enquiries" ("id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."crm_source_links"'::regclass AND conname='crm_source_links_clientId_fk') THEN ALTER TABLE public."crm_source_links" ADD CONSTRAINT "crm_source_links_clientId_fk" FOREIGN KEY ("organization_id","client_id") REFERENCES "public"."clients" ("organization_id","id") ON DELETE restrict ON UPDATE no action; END IF; END $$;

COMMIT;
