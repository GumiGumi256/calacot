import Link from "next/link";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { notFound } from "next/navigation";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { ProjectStart } from "@/components/sales/project-start";
import { readProjectWorkspace } from "@/lib/projects/workspace";
import { CreateProjectTask } from "@/components/admin/create-project-task";
import { ProjectTaskStatus } from "@/components/admin/project-task-status";
import { EditProjectTask } from "@/components/admin/edit-project-task";
import { ProjectTaskComment } from "@/components/admin/project-task-comment";
import { AddProjectMember, RemoveProjectMember } from "@/components/admin/project-team-actions";
import { CreateMilestone, EditMilestone, MilestoneReview, ProjectTransition } from "@/components/admin/project-milestones";
import { ProjectExpenses } from "@/components/finance/project-expenses";
import { ProjectExpenseCreate } from "@/components/finance/project-expense-create";
import { ProjectTeamPayments } from "@/components/finance/project-team-payments";
import { expenseFormOptions } from "@/lib/finance/expenses";
import { RecordDocuments } from "@/components/documents/record-documents";
import { PageHeader } from "@/components/layout/page-header";
import { PageContainer } from "@/components/layout/page-container";
import { StatusBadge } from "@/components/ui/status-badge";

function displayDate(value: unknown) {
  if (!value) return "Not scheduled";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "Unavailable" : new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeZone: "Africa/Kampala" }).format(date);
}
const activityLabels: Record<string, string> = {
  "project.create": "Project created", "project.start": "Project started", "project.transition": "Project status changed",
  "task.create": "Task created", "task.status": "Task status changed", "task.edit": "Task updated", "task.comment": "Task comment added",
  "milestone.create": "Milestone created", "milestone.edit": "Milestone updated", "milestone.submit": "Milestone submitted for review",
  "milestone.approve": "Milestone approved", "milestone.return": "Milestone returned for changes", "milestone.reject": "Milestone rejected",
  "team.add": "Team member added", "team.remove": "Team member removed",
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await staffContext("projects_read");
  if (!z.uuid().safeParse(id).success) notFound();
  const p = (
    await db.execute(
      sql`SELECT p.*,c.display_name AS client_name FROM projects p JOIN clients c ON c.id=p.client_id AND c.organization_id=p.organization_id WHERE p.id=${id}::uuid AND p.organization_id=${ctx.organizationId}`,
    )
  ).rows[0];
  if (!p) notFound();
  const workspace = await readProjectWorkspace(ctx.organizationId, id, ctx.permissions);
  const expenseOptions = ctx.permissions.includes("expenses_create") && !p.archived_at ? await expenseFormOptions() : null;
  const expenseToday = expenseOptions ? (await db.execute<{ d: string }>(sql`SELECT finance_kampala_today()::text AS d`)).rows[0].d : null;
  const createExpense = expenseOptions && expenseToday ? <ProjectExpenseCreate project={{ id, name: String(p.name), code: String(p.code), division: String(p.division), currency: String(p.currency) }} suppliers={expenseOptions.suppliers} members={workspace.members.map((m) => ({ id: String(m.id), project_id: id, name: String(m.name), detail: [m.responsibility, m.external_company].filter(Boolean).join(" · ") || null }))} today={expenseToday} /> : null;
  const staff = ctx.permissions.includes("projects_write") ? (await db.execute<{ id: string; name: string }>(sql`SELECT id,coalesce(display_name,clerk_user_id) AS name FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND status='active' ORDER BY name,id LIMIT 100`)).rows : [];
  return (
    <PageContainer>
      <PageHeader
        title={String(p.name)}
        description={<>{String(p.code)} · Agreement: {p.quotation_version_id ? "Confirmed" : "Pre-sales"}</>}
        meta={<StatusBadge domain="project" status={String(p.status)} />}
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          {ctx.permissions.includes("clients_read") ? <Link className="underline underline-offset-4" href={`/admin/clients/${p.client_id}`}>{String(p.client_name)}</Link> : <span>{String(p.client_name)}</span>}
          <p>{String(p.scope || "")}</p>
          <p>
            {String(p.division)} · {String(p.currency)} · Start:{" "}
            {String(p.starts_on || "Not scheduled")}
          </p>
          <p>Deadline: {displayDate(p.due_on)} · Manager: {String(workspace.manager?.name || "Unassigned")}</p>
          {ctx.permissions.includes("quotations_read") && (workspace.quotation ? <Link className="underline underline-offset-4" href={`/admin/quotations/${workspace.quotation.id}`}>Quotation {String(workspace.quotation.number || "Draft")} · version {String(workspace.quotation.version)} · {String(workspace.quotation.status)}</Link> : <Link className="underline underline-offset-4" href={`/admin/quotations?clientId=${p.client_id}`}>Client quotations</Link>)}
          {ctx.role === "org:admin" && !p.archived_at && <ProjectTransition projectId={id} status={String(p.status)} />}
          {ctx.permissions.includes("projects_write") &&
            p.status === "planned" &&
            !!p.quotation_version_id && <ProjectStart id={id} />}
        </CardContent>
      </Card>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Tasks</CardTitle><CardDescription>{workspace.counts?.total ? `${workspace.counts.completed} of ${workspace.counts.total} non-cancelled tasks completed` : "No tasks yet"}. Showing up to 100 tasks.</CardDescription></CardHeader><CardContent className="space-y-4">{workspace.tasks.length ? <ul className="divide-y">{workspace.tasks.map(t => <li key={String(t.id)} className="space-y-1 py-3 first:pt-0"><p className="font-medium break-words">{String(t.title)}</p><p className="text-sm text-muted-foreground">{String(t.status).replaceAll("_", " ")} · {String(t.priority)} · {String(t.assignee || "Unassigned")} · Due {displayDate(t.due_at)}{t.due_at && !["completed", "cancelled"].includes(String(t.status)) && new Date(String(t.due_at)).getTime() < Date.now() ? " · Overdue" : ""}</p>{ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && !p.archived_at && <ProjectTaskStatus projectId={id} taskId={String(t.id)} status={String(t.status)} version={String(t.version)} />}{ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && !p.archived_at && <EditProjectTask projectId={id} taskId={String(t.id)} title={String(t.title)} priority={String(t.priority)} assigneeId={String(t.assignee_id || "")} dueDate={String(t.due_date || "")} version={String(t.version)} mandatory={Boolean(t.mandatory)} staff={staff} />}<details className="mt-2 text-sm"><summary className="cursor-pointer font-medium">Progress updates</summary>{Array.isArray(t.comments) && t.comments.length > 0 ? <ul className="my-2 space-y-2">{(t.comments as {id: string; author: string; body: string; created_at: string}[]).map(c => <li key={c.id}><span className="text-muted-foreground">{c.author} · {displayDate(c.created_at)}</span><p className="whitespace-pre-wrap break-words">{c.body}</p></li>)}</ul> : <p className="my-2 text-muted-foreground">No updates yet.</p>}{ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && !p.archived_at && <ProjectTaskComment projectId={id} taskId={String(t.id)} commentId={randomUUID()} />}</details></li>)}</ul> : <p className="text-sm text-muted-foreground">No project tasks have been recorded.</p>}{ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && !p.archived_at && <CreateProjectTask projectId={id} taskId={randomUUID()} staff={staff} />}</CardContent></Card>
        <Card><CardHeader><CardTitle>Milestones</CardTitle><CardDescription>Showing up to 100 milestones.</CardDescription></CardHeader><CardContent className="space-y-4">{workspace.milestones.length ? <ul className="divide-y">{workspace.milestones.map(m => <li key={String(m.id)} className="py-3 first:pt-0"><p className="font-medium break-words">{String(m.title)}</p><p className="text-sm text-muted-foreground">{String(m.status).replaceAll("_", " ")} · {m.mandatory ? "Required" : "Optional"} · {String(m.responsible || "Unassigned")} · Due {displayDate(m.due_at)}</p>{Boolean(m.deliverable) && <p className="text-sm whitespace-pre-wrap break-words">Deliverable: {String(m.deliverable)}</p>}{Boolean(m.completion_evidence) && <p className="text-sm whitespace-pre-wrap break-words">Evidence: {String(m.completion_evidence)}</p>}{Boolean(m.review_feedback) && <p className="text-sm whitespace-pre-wrap break-words">Review feedback: {String(m.review_feedback)}</p>}{ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && ["pending", "in_progress"].includes(String(m.status)) && !p.archived_at && <EditMilestone projectId={id} milestoneId={String(m.id)} version={String(m.version)} title={String(m.title)} deliverable={String(m.deliverable || "")} dueDate={String(m.due_date || "")} assigneeId={String(m.responsible_staff_id || "")} mandatory={Boolean(m.mandatory)} staff={staff} />}{ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && !p.archived_at && <MilestoneReview projectId={id} milestoneId={String(m.id)} version={String(m.version)} status={String(m.status)} admin={ctx.role === "org:admin"} />}</li>)}</ul> : <p className="text-sm text-muted-foreground">No milestones have been recorded.</p>}{ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && !p.archived_at && <CreateMilestone projectId={id} milestoneId={randomUUID()} staff={staff} />}</CardContent></Card>
        <Card><CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3"><div><CardTitle>Project team</CardTitle><CardDescription>Showing up to 100 members.</CardDescription></div>{ctx.permissions.includes("projects_write") && !p.archived_at && <AddProjectMember projectId={id} staff={staff} />}</CardHeader><CardContent>{workspace.members.length ? <ul className="divide-y">{workspace.members.map(m => <li key={String(m.id)} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0"><div><p className="font-medium">{String(m.name)}</p><p className="text-sm text-muted-foreground">{m.staff_id ? "Calacot staff" : "External member"}{m.external_company ? ` · ${String(m.external_company)}` : ""}{m.responsibility ? ` · ${String(m.responsibility)}` : ""}</p>{!!m.external_phone && <p className="text-sm">{String(m.external_phone)}</p>}{!!m.external_email && <p className="text-sm">{String(m.external_email)}</p>}</div>{ctx.permissions.includes("projects_write") && !p.archived_at && <RemoveProjectMember projectId={id} memberId={String(m.id)} name={String(m.name)} />}</li>)}</ul> : <p className="text-sm text-muted-foreground">No project members have been recorded.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Project activity</CardTitle><CardDescription>Most recent 50 project updates.</CardDescription></CardHeader><CardContent>{workspace.activity.length ? <ul className="space-y-2 text-sm">{workspace.activity.map((a,i) => <li key={i}>{activityLabels[String(a.action)] ?? "Project updated"} · {String(a.actor_name || (a.actor_type === "system" ? "System" : "Staff member"))} · {displayDate(a.created_at)}</li>)}</ul> : <p className="text-sm text-muted-foreground">No project activity has been recorded.</p>}</CardContent></Card>
        {workspace.invoices && <Card><CardHeader><CardTitle>Invoices</CardTitle><CardDescription>Most recent 50 project invoices; balances use the existing ledger.</CardDescription></CardHeader><CardContent>{workspace.invoices.length ? <ul className="space-y-2 text-sm">{workspace.invoices.map(i => <li key={String(i.id)}><Link className="underline underline-offset-4" href={`/admin/invoices/${i.id}`}>{String(i.number || "Draft")}</Link> · {String(i.status)} · {String(i.currency)} {String(i.total)} · Due {String(i.balance)}</li>)}</ul> : <p className="text-sm text-muted-foreground">No invoices linked to this project.</p>}</CardContent></Card>}
        <RecordDocuments type="project" id={id} label={`${String(p.code)} ${String(p.name)}`} />
        {workspace.expenses ? <ProjectExpenses projectId={id} expenses={workspace.expenses} summary={workspace.expenseSummary ?? []} activity={workspace.expenseActivity ?? []} createAction={createExpense} /> : createExpense && <Card><CardHeader><CardTitle>Project expenses</CardTitle><CardDescription>Create an expense request for this project.</CardDescription></CardHeader><CardContent>{createExpense}</CardContent></Card>}
        {workspace.teamPayments && <ProjectTeamPayments rows={workspace.teamPayments} />}
      </div>
    </PageContainer>
  );
}
