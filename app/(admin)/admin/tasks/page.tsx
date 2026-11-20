import Link from "next/link";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/feedback/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { statusRegistry } from "@/lib/ui/status";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

type Params = Record<string, string | string[] | undefined>;
export default async function TasksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await staffContext("projects_read");
  const raw = await searchParams;
  const value = (key: string) => typeof raw[key] === "string" ? raw[key] as string : "";
  const status = ["todo", "in_progress", "blocked", "completed", "cancelled"].includes(value("status")) ? value("status") : "";
  const priority = ["low", "normal", "high", "urgent"].includes(value("priority")) ? value("priority") : "";
  const assignee = value("assignee") === "mine" || z.uuid().safeParse(value("assignee")).success ? value("assignee") : "";
  const project = z.uuid().safeParse(value("project")).success ? value("project") : "";
  const where: SQL[] = [sql`t.organization_id=${ctx.organizationId}`];
  if (status) where.push(sql`t.status=${status}`);
  if (priority) where.push(sql`t.priority=${priority}`);
  if (project) where.push(sql`t.project_id=${project}::uuid`);
  if (assignee === "mine") where.push(sql`s.clerk_user_id=${ctx.actor}`);
  else if (assignee) where.push(sql`t.assignee_id=${assignee}::uuid`);
  const [tasks, staff, projects] = await Promise.all([
    db.execute(sql`SELECT t.id,t.title,t.status,t.priority,t.due_at,p.id AS project_id,p.name AS project_name,coalesce(s.display_name,s.clerk_user_id) AS assignee FROM tasks t JOIN projects p ON p.id=t.project_id AND p.organization_id=t.organization_id LEFT JOIN staff_memberships s ON s.id=t.assignee_id AND s.organization_id=t.organization_id WHERE ${sql.join(where, sql` AND `)} ORDER BY t.due_at NULLS LAST,t.id LIMIT 100`),
    db.execute<{ id: string; name: string }>(sql`SELECT id,coalesce(display_name,clerk_user_id) AS name FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND status='active' ORDER BY name,id LIMIT 100`),
    db.execute<{ id: string; name: string }>(sql`SELECT id,name FROM projects WHERE organization_id=${ctx.organizationId} AND archived_at IS NULL ORDER BY name,id LIMIT 100`),
  ]);
  const filtered = !!(status || priority || assignee || project);
  const field = "flex flex-col gap-2 text-sm font-medium";
  const label = (v: string) => v[0].toUpperCase() + v.slice(1).replaceAll("_", " ");
  return (
    <PageContainer>
      <PageHeader title="Project tasks" description="Work assigned across projects. Filter by person, project, status and priority; showing up to 100 tasks, soonest due first." />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className={field}>Assigned employee<NativeSelect name="assignee" defaultValue={assignee}><option value="">All</option><option value="mine">My tasks</option>{staff.rows.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></label>
        <label className={field}>Project<NativeSelect name="project" defaultValue={project}><option value="">All</option>{projects.rows.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></label>
        <label className={field}>Status<NativeSelect name="status" defaultValue={status}><option value="">All</option>{Object.entries(statusRegistry.task).map(([k, v])=><option key={k} value={k}>{v.label}</option>)}</NativeSelect></label>
        <label className={field}>Priority<NativeSelect name="priority" defaultValue={priority}><option value="">All</option>{["low","normal","high","urgent"].map(s=><option key={s} value={s}>{label(s)}</option>)}</NativeSelect></label>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">Apply</Button>
          {filtered && <Button variant="ghost" nativeButton={false} render={<Link href="/admin/tasks" />}>Reset</Button>}
        </div>
      </form>
      {tasks.rows.length ? (
        <ul className="surface-card flex flex-col divide-y divide-border overflow-hidden" aria-label="Project tasks">
          {tasks.rows.map((t) => {
            const overdue = !!t.due_at && !["completed", "cancelled"].includes(String(t.status)) && new Date(String(t.due_at)).getTime() < Date.now();
            return (
              <li key={String(t.id)} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link className="font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm outline-none" href={`/admin/projects/${t.project_id}`}>{String(t.title)}</Link>
                  <p className="type-caption">{String(t.project_name)} · {String(t.assignee || "Unassigned")} · {label(String(t.priority))} priority</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={overdue ? "type-caption text-destructive-text" : "type-caption"}>{t.due_at ? `${overdue ? "Overdue · " : "Due "}${formatDate(String(t.due_at))}` : "No due date"}</span>
                  <StatusBadge domain="task" status={String(t.status)} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="surface-card overflow-hidden">
          {filtered ? <EmptyState kind="filtered-out" action={<Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin/tasks" />}>Clear filters</Button>} /> : <EmptyState kind="no-records" title="No project tasks yet" description="Tasks are added from a project's page." />}
        </div>
      )}
    </PageContainer>
  );
}
