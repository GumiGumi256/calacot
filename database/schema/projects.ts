import { sql } from "drizzle-orm";
import {
  check,
  integer,
  date,
  index,
  unique,
  pgTable,
  text,
  uuid,
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
import { organizations } from "./organization";
import { clients } from "./clients";
import { quotationVersions } from "./quotations";
import { staffMemberships } from "./organization";

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
  (t) => [
    unique("projects_org_id_uq").on(t.organizationId, t.id),
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
  (t) => [
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
  (t) => [
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
