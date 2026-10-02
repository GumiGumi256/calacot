import { sql } from "drizzle-orm";
import {
  foreignKey,
  check,
  index,
  unique,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { allowed, instant, timestamps, scopedForeignKey } from "./common";
import { organizations } from "./organization";
import { projects, projectMilestones } from "./projects";
import { opportunities } from "./opportunities";
import { staffMemberships } from "./organization";

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    projectId: uuid("project_id"),
    milestoneId: uuid("milestone_id"),
    opportunityId: uuid("opportunity_id"),
    assigneeId: uuid("assignee_id"),
    createdById: uuid("created_by_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", {
      enum: ["todo", "in_progress", "blocked", "completed", "cancelled"],
    })
      .notNull()
      .default("todo"),
    priority: text("priority", { enum: ["low", "normal", "high", "urgent"] })
      .notNull()
      .default("normal"),
    dueAt: instant("due_at"),
    completedAt: instant("completed_at"),
    ...timestamps(),
  },
  (t) => [
    unique("tasks_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "tasks_projectId_fk",
      t.organizationId,
      t.projectId,
      projects.organizationId,
      projects.id,
    ),
    foreignKey({
      name: "tasks_milestone_project_fk",
      columns: [t.organizationId, t.projectId, t.milestoneId],
      foreignColumns: [
        projectMilestones.organizationId,
        projectMilestones.projectId,
        projectMilestones.id,
      ],
    }).onDelete("restrict"),
    scopedForeignKey(
      "tasks_opportunityId_fk",
      t.organizationId,
      t.opportunityId,
      opportunities.organizationId,
      opportunities.id,
    ),
    scopedForeignKey(
      "tasks_assigneeId_fk",
      t.organizationId,
      t.assigneeId,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    scopedForeignKey(
      "tasks_createdById_fk",
      t.organizationId,
      t.createdById,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    allowed("tasks_status_check", t.status, [
      "todo",
      "in_progress",
      "blocked",
      "completed",
      "cancelled",
    ]),
    allowed("tasks_priority_check", t.priority, [
      "low",
      "normal",
      "high",
      "urgent",
    ]),
    check(
      "tasks_milestone_project_check",
      sql`${t.milestoneId} is null or ${t.projectId} is not null`,
    ),
    check(
      "tasks_completed_check",
      sql`${t.status} <> 'completed' or ${t.completedAt} is not null`,
    ),
    index("tasks_assignee_due_idx").on(
      t.organizationId,
      t.assigneeId,
      t.status,
      t.dueAt,
    ),
    index("tasks_project_idx").on(t.organizationId, t.projectId),
  ],
);
export type TasksRecord = typeof tasks.$inferSelect;

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    taskId: uuid("task_id").notNull(),
    authorId: uuid("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("task_comments_org_id_uq").on(t.organizationId, t.id),
    scopedForeignKey(
      "task_comments_taskId_fk",
      t.organizationId,
      t.taskId,
      tasks.organizationId,
      tasks.id,
    ),
    scopedForeignKey(
      "task_comments_authorId_fk",
      t.organizationId,
      t.authorId,
      staffMemberships.organizationId,
      staffMemberships.id,
    ),
    index("task_comments_timeline_idx").on(
      t.organizationId,
      t.taskId,
      t.createdAt,
    ),
  ],
);
export type TaskCommentsRecord = typeof taskComments.$inferSelect;
