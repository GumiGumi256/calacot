import Link from "next/link";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  const selectClass = "h-9 rounded-md border bg-transparent px-3 text-sm";
  return <div className="p-4 md:p-6"><Card><CardHeader><CardTitle as="h1">Project tasks</CardTitle><CardDescription>Filter project tasks by assignment, project, status and priority. Showing up to 100 results.</CardDescription></CardHeader><CardContent className="space-y-5">
    <form method="get" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">Assigned employee<select className={selectClass} name="assignee" defaultValue={assignee}><option value="">All</option><option value="mine">My tasks</option>{staff.rows.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-sm">Project<select className={selectClass} name="project" defaultValue={project}><option value="">All</option>{projects.rows.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-sm">Status<select className={selectClass} name="status" defaultValue={status}><option value="">All</option>{["todo","in_progress","blocked","completed","cancelled"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-sm">Priority<select className={selectClass} name="priority" defaultValue={priority}><option value="">All</option>{["low","normal","high","urgent"].map(s=><option key={s} value={s}>{s}</option>)}</select></label>
      <Button type="submit">Apply filters</Button><Button variant="outline" render={<Link href="/admin/tasks" />}>Reset</Button>
    </form>
    {tasks.rows.length ? <ul className="divide-y">{tasks.rows.map(t=><li key={String(t.id)} className="space-y-1 py-3"><Link className="font-medium underline underline-offset-4" href={`/admin/projects/${t.project_id}`}>{String(t.title)}</Link><p className="text-sm text-muted-foreground">{String(t.project_name)} · {String(t.status).replaceAll("_"," ")} · {String(t.priority)} · {String(t.assignee || "Unassigned")} · {t.due_at ? `Due ${new Intl.DateTimeFormat("en-UG",{dateStyle:"medium",timeZone:"Africa/Kampala"}).format(new Date(String(t.due_at)))}` : "No due date"}{t.due_at && !["completed","cancelled"].includes(String(t.status)) && new Date(String(t.due_at)).getTime()<Date.now() ? " · Overdue" : ""}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">No project tasks match these filters.</p>}
  </CardContent></Card></div>;
}
