import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  foreignKey,
  date,
  check,
  uniqueIndex,
  integer,
  index,
  unique,
  pgTable,
  text,
  uuid,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";
import {
  allowed,
  currencies,
  divisions,
  instant,
  money,
  timestamps,
  scopedForeignKey,
} from "./common";
import { organizations, staffMemberships } from "./organization";
import { clients } from "./clients";
import { opportunities } from "./opportunities";
import { services } from "./services";
import { clientContacts } from "./clients";
import type { DocumentSnapshot } from "../../lib/sales/document-model";

export const quotations = pgTable(
  "quotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    clientId: uuid("client_id").notNull(),
    projectId: uuid("project_id"), // Nullable only during verified historical reconciliation.
    opportunityId: uuid("opportunity_id"),
    number: text("number"), // Assigned once before sending.
    title: text("title").notNull(),
    division: text("division", { enum: divisions }).notNull(),
    archivedAt: instant("archived_at"),
    ...timestamps(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique("quotations_org_id_uq").on(t.organizationId, t.id),
    foreignKey({
      name: "quotations_project_client_fk",
      columns: [t.organizationId, t.projectId, t.clientId],
      foreignColumns: [projects.organizationId, projects.id, projects.clientId],
    }).onDelete("restrict"),
    scopedForeignKey(
      "quotations_clientId_fk",
      t.organizationId,
      t.clientId,
      clients.organizationId,
      clients.id,
    ),
    scopedForeignKey(
      "quotations_opportunityId_fk",
      t.organizationId,
      t.opportunityId,
      opportunities.organizationId,
      opportunities.id,
    ),
    allowed("quotations_division_check", t.division, divisions),
    unique("quotations_number_org_uq").on(t.organizationId, t.number),
    index("quotations_client_idx").on(t.organizationId, t.clientId),
  ],
);
export type QuotationsRecord = typeof quotations.$inferSelect;

export const quotationVersions = pgTable(
  "quotation_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    quotationId: uuid("quotation_id").notNull(),
    version: integer("version").notNull(),
    revision: integer("revision").notNull().default(0),
    deliveryContactId: uuid("delivery_contact_id"),
    acceptanceEvidence: jsonb("acceptance_evidence").$type<
      Record<string, string>
    >(),
    documentSnapshot: jsonb("document_snapshot").$type<DocumentSnapshot>(),
    status: text("status", {
      enum: ["draft", "sent", "accepted", "declined", "expired", "superseded"],
    })
      .notNull()
      .default("draft"),
    customerSnapshot: jsonb("customer_snapshot")
      .$type<{
        name: string;
        email?: string;
        address?: string;
        taxIdentifier?: string;
      }>()
      .notNull(),
    issuerSnapshot: jsonb("issuer_snapshot")
      .$type<{
        legalName: string;
        address?: string;
        email?: string;
        phone?: string;
        taxIdentifier?: string;
      }>()
      .notNull(),
    scope: text("scope").notNull(),
    deliverables: jsonb("deliverables")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    exclusions: jsonb("exclusions")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    terms: text("terms").notNull(),
    currency: text("currency", { enum: currencies }).notNull().default("UGX"),
    subtotal: money("subtotal").notNull().default("0"),
    discountAmount: money("discount_amount").notNull().default("0"),
    taxAmount: money("tax_amount").notNull().default("0"),
    total: money("total").notNull().default("0"),
    validUntil: instant("valid_until"),
    sentAt: instant("sent_at"),
    acceptedAt: instant("accepted_at"),
    acceptedByName: text("accepted_by_name"),
    declinedAt: instant("declined_at"),
    ...timestamps(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique("quotation_versions_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "quotation_versions_contact_fk",
      t.organizationId,
      t.deliveryContactId,
      clientContacts.organizationId,
      clientContacts.id,
    ),
    scopedForeignKey(
      "quotation_versions_quotationId_fk",
      t.organizationId,
      t.quotationId,
      quotations.organizationId,
      quotations.id,
    ),
    allowed("quotation_versions_status_check", t.status, [
      "draft",
      "sent",
      "accepted",
      "declined",
      "expired",
      "superseded",
    ]),
    allowed("quotation_versions_currency_check", t.currency, currencies),
    check("quotation_versions_revision_check", sql`${t.version} > 0`),
    check(
      "quotation_versions_amounts_check",
      sql`${t.subtotal} >= 0 and ${t.discountAmount} >= 0 and ${t.discountAmount} <= ${t.subtotal} and ${t.taxAmount} >= 0 and ${t.total} = ${t.subtotal} - ${t.discountAmount} + ${t.taxAmount}`,
    ),
    check(
      "quotation_versions_sent_check",
      sql`${t.status} = 'draft' or ${t.sentAt} is not null`,
    ),
    check(
      "quotation_versions_accepted_check",
      sql`${t.status} <> 'accepted' or (${t.acceptedAt} is not null and nullif(trim(${t.acceptedByName}), '') is not null)`,
    ),
    check(
      "quotation_versions_arrays_check",
      sql`jsonb_typeof(${t.deliverables}) = 'array' and jsonb_typeof(${t.exclusions}) = 'array'`,
    ),
    unique("quotation_versions_revision_uq").on(
      t.organizationId,
      t.quotationId,
      t.version,
    ),
    index("quotation_versions_status_idx").on(t.organizationId, t.status),
    uniqueIndex("quotation_versions_accepted_uq")
      .on(t.organizationId, t.quotationId)
      .where(sql`${t.status} = 'accepted'`),
  ],
);
export type QuotationVersionsRecord = typeof quotationVersions.$inferSelect;

export const quotationItems = pgTable(
  "quotation_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    quotationVersionId: uuid("quotation_version_id").notNull(),
    serviceId: uuid("service_id"),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    unit: text("unit").notNull().default("item"),
    quantity: numeric("quantity", { precision: 17, scale: 4 })
      .notNull()
      .default("1"),
    unitPrice: money("unit_price").notNull(),
    discountAmount: money("discount_amount").notNull().default("0"),
    taxRate: money("tax_rate").notNull().default("0"),
    subtotal: money("subtotal").notNull(),
    taxAmount: money("tax_amount").notNull().default("0"),
    total: money("total").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique("quotation_items_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "quotation_items_quotationVersionId_fk",
      t.organizationId,
      t.quotationVersionId,
      quotationVersions.organizationId,
      quotationVersions.id,
    ),
    scopedForeignKey(
      "quotation_items_serviceId_fk",
      t.organizationId,
      t.serviceId,
      services.organizationId,
      services.id,
    ),
    check(
      "quotation_items_values_check",
      sql`${t.position} >= 0 and ${t.quantity} > 0 and ${t.unitPrice} >= 0 and ${t.discountAmount} >= 0 and ${t.taxRate} between 0 and 100 and ${t.taxAmount} >= 0`,
    ),
    check(
      "quotation_items_math_check",
      sql`${t.subtotal} = round(${t.quantity} * ${t.unitPrice}, 2) and ${t.discountAmount} <= ${t.subtotal} and ${t.taxAmount} = round((${t.subtotal} - ${t.discountAmount}) * ${t.taxRate} / 100, 2) and ${t.total} = ${t.subtotal} - ${t.discountAmount} + ${t.taxAmount}`,
    ),
    unique("quotation_items_position_uq").on(
      t.organizationId,
      t.quotationVersionId,
      t.position,
    ),
  ],
);
export type QuotationItemsRecord = typeof quotationItems.$inferSelect;

export const quotationPaymentSchedules = pgTable(
  "quotation_payment_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    quotationVersionId: uuid("quotation_version_id").notNull(),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    amount: money("amount").notNull(),
    dueAt: instant("due_at"),
    trigger: text("trigger"),
  },
  (t): PgTableExtraConfigValue[] => [
    unique("quotation_payment_schedules_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "quotation_payment_schedules_quotationVersionId_fk",
      t.organizationId,
      t.quotationVersionId,
      quotationVersions.organizationId,
      quotationVersions.id,
    ),
    check(
      "quotation_payment_schedules_amount_check",
      sql`${t.amount} > 0 and ${t.position} >= 0`,
    ),
    unique("quotation_payment_schedules_position_uq").on(
      t.organizationId,
      t.quotationVersionId,
      t.position,
    ),
  ],
);
export type QuotationPaymentSchedulesRecord =
  typeof quotationPaymentSchedules.$inferSelect;

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    clientId: uuid("client_id").notNull(),
    quotationVersionId: uuid("quotation_version_id"),
    managerId: uuid("manager_id"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    division: text("division", { enum: divisions }).notNull(),
    status: text("status", {
      enum: ["planned", "active", "on_hold", "completed", "cancelled"],
    })
      .notNull()
      .default("planned"),
    scope: text("scope"),
    startsOn: date("starts_on"),
    dueOn: date("due_on"),
    completedAt: instant("completed_at"),
    budget: money("budget"),
    currency: text("currency", { enum: currencies }).notNull().default("UGX"),
    archivedAt: instant("archived_at"),
    ...timestamps(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique("projects_org_id_uq").on(t.organizationId, t.id),
    unique("projects_org_client_uq").on(t.organizationId, t.id, t.clientId),
    scopedForeignKey(
      "projects_clientId_fk",
      t.organizationId,
      t.clientId,
      clients.organizationId,
      clients.id,
    ),
    scopedForeignKey(
      "projects_quotationVersionId_fk",
      t.organizationId,
      t.quotationVersionId,
      quotationVersions.organizationId,
      quotationVersions.id,
    ),
    scopedForeignKey(
      "projects_managerId_fk",
      t.organizationId,
      t.managerId,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    allowed("projects_status_check", t.status, [
      "planned",
      "active",
      "on_hold",
      "completed",
      "cancelled",
    ]),
    allowed("projects_division_check", t.division, divisions),
    allowed("projects_currency_check", t.currency, currencies),
    check(
      "projects_budget_check",
      sql`${t.budget} is null or ${t.budget} >= 0`,
    ),
    check(
      "projects_dates_check",
      sql`${t.startsOn} is null or ${t.dueOn} is null or ${t.dueOn} >= ${t.startsOn}`,
    ),
    check(
      "projects_completed_check",
      sql`${t.status} <> 'completed' or ${t.completedAt} is not null`,
    ),
    unique("projects_code_org_uq").on(t.organizationId, t.code),
    index("projects_status_idx").on(t.organizationId, t.division, t.status),
  ],
);
export type ProjectsRecord = typeof projects.$inferSelect;

export const projectMembers = pgTable(
  "project_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: uuid("project_id").notNull(),
    staffId: uuid("staff_id").notNull(),
    responsibility: text("responsibility"),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique("project_members_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "project_members_projectId_fk",
      t.organizationId,
      t.projectId,
      projects.organizationId,
      projects.id,
    ),
    scopedForeignKey(
      "project_members_staffId_fk",
      t.organizationId,
      t.staffId,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    unique("project_members_staff_uq").on(
      t.organizationId,
      t.projectId,
      t.staffId,
    ),
    index("project_members_staff_idx").on(t.organizationId, t.staffId),
  ],
);
export type ProjectMembersRecord = typeof projectMembers.$inferSelect;

export const projectMilestones = pgTable(
  "project_milestones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: uuid("project_id").notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    status: text("status", {
      enum: [
        "pending",
        "in_progress",
        "awaiting_approval",
        "completed",
        "cancelled",
      ],
    })
      .notNull()
      .default("pending"),
    dueAt: instant("due_at"),
    completedAt: instant("completed_at"),
    clientApprovedAt: instant("client_approved_at"),
    ...timestamps(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique("project_milestones_org_id_uq").on(t.organizationId, t.id),
    unique("project_milestones_project_id_uq").on(
      t.organizationId,
      t.projectId,
      t.id,
    ),
    scopedForeignKey(
      "project_milestones_projectId_fk",
      t.organizationId,
      t.projectId,
      projects.organizationId,
      projects.id,
    ),
    allowed("project_milestones_status_check", t.status, [
      "pending",
      "in_progress",
      "awaiting_approval",
      "completed",
      "cancelled",
    ]),
    check("project_milestones_position_check", sql`${t.position} >= 0`),
    check(
      "project_milestones_completed_check",
      sql`${t.status} <> 'completed' or ${t.completedAt} is not null`,
    ),
    unique("project_milestones_position_uq").on(
      t.organizationId,
      t.projectId,
      t.position,
    ),
  ],
);
export type ProjectMilestonesRecord = typeof projectMilestones.$inferSelect;
