import Link from "next/link";
import { ArrowRightLeft, Building2, CalendarDays, FileText, Plus, Tag, UserRound } from "lucide-react";
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
import { SetContractValue } from "@/components/admin/project-team-actions";
import { ProjectTeam } from "@/components/admin/project-team";
import { ProjectSummaryEdit } from "@/components/admin/project-summary-edit";
import { CreateMilestone, EditMilestone, MilestoneReview, ProjectTransition } from "@/components/admin/project-milestones";
import { ProjectExpenses } from "@/components/finance/project-expenses";
import { ProjectExpenseCreate } from "@/components/finance/project-expense-create";
import { ProjectTeamPayments } from "@/components/finance/project-team-payments";
import { ProjectFinancials } from "@/components/finance/project-financials";
import { expenseFormOptions } from "@/lib/finance/expenses";
import { RecordDocuments } from "@/components/documents/record-documents";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/layout/page-container";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProjectFormDialog } from "@/components/admin/project-form-dialog";

function displayDate(value: unknown) {
  if (!value) return "Not scheduled";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "Unavailable" : new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeZone: "Africa/Kampala" }).format(date);
}
function displayTimeline(start: unknown, due: unknown) {
  if (!start && !due) return "Not scheduled";
  if (!start) return `Due ${displayDate(due)}`;
  if (!due) return `Starts ${displayDate(start)}`;
  return `${displayDate(start)} → ${displayDate(due)}`;
}
const activityLabels: Record<string, string> = {
  "project.create": "Project created", "project.start": "Project started", "project.transition": "Project status changed",
  "task.create": "Task created", "task.status": "Task status changed", "task.edit": "Task updated", "task.comment": "Task comment added",
  "milestone.create": "Milestone created", "milestone.edit": "Milestone updated", "milestone.submit": "Milestone submitted for review",
  "milestone.approve": "Milestone approved", "milestone.return": "Milestone returned for changes", "milestone.reject": "Milestone rejected",
  "team.add": "Team member added", "team.remove": "Team member removed", "team.pay": "Team member's agreed pay changed",
  "project.contract_value": "Contract value changed",
  "project.timeline": "Project timeline changed", "project.manager": "Project manager changed",
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
  const createExpense = expenseOptions && expenseToday ? <ProjectExpenseCreate project={{ id, name: String(p.name), code: String(p.code), division: String(p.division), currency: String(p.currency) }} suppliers={expenseOptions.suppliers} members={workspace.members.map((m) => ({ id: String(m.id), project_id: id, name: String(m.name), detail: [m.responsibility, m.external_company].filter(Boolean).join(" · ") || null }))} today={expenseToday} verified={expenseOptions.verified} /> : null;
  // Agreed pay is visible to finance readers and to whoever manages the project team.
  const showPay = ctx.permissions.includes("expenses_read") || ctx.permissions.includes("projects_write");
  const staff = ctx.permissions.includes("projects_write") ? (await db.execute<{ id: string; name: string }>(sql`SELECT id,coalesce(display_name,clerk_user_id) AS name FROM staff_memberships WHERE organization_id=${ctx.organizationId} AND status='active' ORDER BY name,id LIMIT 100`)).rows : [];
  return (
    <PageContainer className="[--card-nested:var(--color-brand-white)] dark:[--card-nested:var(--surface-subtle)]">
      <Card id="overview">
        <CardContent className="space-y-5">
          <div className="space-y-2"><div className="flex flex-wrap items-center gap-3"><h1 className="type-page-title break-words">{String(p.name)}</h1><StatusBadge domain="project" status={String(p.status)} /></div><Badge variant="neutral">{String(p.code)}</Badge></div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 [&>button]:min-h-11 [&>button]:flex-1 sm:[&>button]:min-h-0 sm:[&>button]:flex-none">
              {createExpense}
              {ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && !p.archived_at && <ProjectFormDialog title="Add task" icon={<Plus aria-hidden="true" />}><CreateProjectTask projectId={id} taskId={randomUUID()} staff={staff} /></ProjectFormDialog>}
              {ctx.permissions.includes("projects_write") && p.status === "planned" && !!p.quotation_version_id && <ProjectStart id={id} />}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {ctx.permissions.includes("quotations_read") && (workspace.quotation ? <Link className="inline-flex items-center gap-2 py-2 font-medium underline-offset-4 hover:underline" href={`/admin/quotations/${workspace.quotation.id}`}><FileText className="size-4" aria-hidden="true" />Quotation {String(workspace.quotation.number || "Draft")} · version {String(workspace.quotation.version)}</Link> : <Link className="inline-flex items-center gap-2 py-2 font-medium underline-offset-4 hover:underline" href={`/admin/quotations?clientId=${p.client_id}`}><FileText className="size-4" aria-hidden="true" />Client quotations</Link>)}
              {ctx.role === "org:admin" && !p.archived_at && ["planned", "active", "on_hold"].includes(String(p.status)) && <ProjectFormDialog title="Change project status" variant="ghost" icon={<ArrowRightLeft aria-hidden="true" />}><ProjectTransition projectId={id} status={String(p.status)} /></ProjectFormDialog>}
            </div>
          </div>
          <dl className="grid overflow-hidden rounded-(--card-radius-inner) border border-card-edge bg-card-nested sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex min-w-0 items-center gap-3 border-b border-card-edge p-3 xl:border-r xl:border-b-0"><span className="rounded-md border border-card-edge p-2 text-muted-foreground"><Building2 className="size-4" aria-hidden="true" /></span><div className="min-w-0"><dt className="text-xs text-muted-foreground">Client</dt><dd className="break-words text-sm font-medium">{ctx.permissions.includes("clients_read") ? <Link className="underline-offset-4 hover:underline" href={`/admin/clients/${p.client_id}`}>{String(p.client_name)}</Link> : String(p.client_name)}</dd></div></div>
            <div className="flex min-w-0 items-center gap-3 border-b border-card-edge p-3 sm:border-l xl:border-r xl:border-b-0"><span className="rounded-md border border-card-edge p-2 text-muted-foreground"><Tag className="size-4" aria-hidden="true" /></span><div className="min-w-0"><dt className="text-xs text-muted-foreground">Category &amp; currency</dt><dd className="break-words text-sm font-medium">{String(p.division)} · {String(p.currency)}</dd></div></div>
            <div className="flex min-w-0 items-center gap-3 border-b border-card-edge p-3 sm:border-b-0 xl:border-r"><span className="rounded-md border border-card-edge p-2 text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><dt className="text-xs text-muted-foreground">Timeline</dt><dd className="break-words text-sm">{displayTimeline(p.starts_on, p.due_on)}</dd></div>{ctx.permissions.includes("projects_write") && !p.archived_at && <ProjectSummaryEdit field="timeline" projectId={id} start={String(p.starts_on || "").slice(0, 10)} due={String(p.due_on || "").slice(0, 10)} managerId={String(p.manager_id || "")} staff={staff} />}</div>
            <div className="flex min-w-0 items-center gap-3 p-3 sm:border-l"><span className="rounded-md border border-card-edge p-2 text-muted-foreground"><UserRound className="size-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><dt className="text-xs text-muted-foreground">Project manager</dt><dd className="break-words text-sm">{String(workspace.manager?.name || "Unassigned")}</dd></div>{ctx.permissions.includes("projects_write") && !p.archived_at && <ProjectSummaryEdit field="manager" projectId={id} start={String(p.starts_on || "").slice(0, 10)} due={String(p.due_on || "").slice(0, 10)} managerId={String(p.manager_id || "")} staff={staff} />}</div>
          </dl>
        </CardContent>
      </Card>
      <nav aria-label="Project sections" className="flex min-w-0 gap-5 overflow-x-auto border-b text-sm font-medium [&>a]:shrink-0 [&>a]:py-3"><a className="hover:underline" href="#overview">Overview</a><a className="hover:underline" href="#work">Work &amp; team</a>{workspace.finance && <a className="hover:underline" href="#financials">Financials</a>}<a className="hover:underline" href="#files">Files &amp; activity</a></nav>
      <section className="scroll-mt-6">
      {workspace.finance && <ProjectFinancials f={workspace.finance} contractControl={ctx.role === "org:admin" && !p.archived_at ? <SetContractValue projectId={id} currency={String(p.currency)} amount={workspace.finance.contract_set} /> : undefined} />}
      </section>
      <div id="work" className="grid min-w-0 scroll-mt-6 grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Tasks</CardTitle><CardDescription>{workspace.counts?.total ? `${workspace.counts.completed} of ${workspace.counts.total} non-cancelled tasks completed` : "No tasks yet"}. Showing up to 100 tasks.</CardDescription></CardHeader><CardContent className="space-y-4">{workspace.tasks.length ? <ul className="divide-y">{workspace.tasks.map(t => <li key={String(t.id)} className="space-y-1 py-3 first:pt-0"><p className="font-medium break-words">{String(t.title)}</p><p className="text-sm text-muted-foreground">{String(t.status).replaceAll("_", " ")} · {String(t.priority)} · {String(t.assignee || "Unassigned")} · Due {displayDate(t.due_at)}{t.due_at && !["completed", "cancelled"].includes(String(t.status)) && new Date(String(t.due_at)).getTime() < Date.now() ? " · Overdue" : ""}</p>{ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && !p.archived_at && <ProjectFormDialog title="Update task status"><ProjectTaskStatus projectId={id} taskId={String(t.id)} status={String(t.status)} version={String(t.version)} /></ProjectFormDialog>}{ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && !p.archived_at && <ProjectFormDialog title="Edit task"><EditProjectTask projectId={id} taskId={String(t.id)} title={String(t.title)} priority={String(t.priority)} assigneeId={String(t.assignee_id || "")} dueDate={String(t.due_date || "")} version={String(t.version)} mandatory={Boolean(t.mandatory)} staff={staff} /></ProjectFormDialog>}<details className="mt-2 text-sm"><summary className="cursor-pointer font-medium">Progress updates</summary>{Array.isArray(t.comments) && t.comments.length > 0 ? <ul className="my-2 space-y-2">{(t.comments as {id: string; author: string; body: string; created_at: string}[]).map(c => <li key={c.id}><span className="text-muted-foreground">{c.author} · {displayDate(c.created_at)}</span><p className="whitespace-pre-wrap break-words">{c.body}</p></li>)}</ul> : <p className="my-2 text-muted-foreground">No updates yet.</p>}{ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && !p.archived_at && <ProjectFormDialog title="Add progress update"><ProjectTaskComment projectId={id} taskId={String(t.id)} commentId={randomUUID()} /></ProjectFormDialog>}</details></li>)}</ul> : <p className="text-sm text-muted-foreground">No project tasks have been recorded.</p>}{ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && !p.archived_at && <ProjectFormDialog title="Add task"><CreateProjectTask projectId={id} taskId={randomUUID()} staff={staff} /></ProjectFormDialog>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Milestones</CardTitle><CardDescription>Showing up to 100 milestones.</CardDescription></CardHeader><CardContent className="space-y-4">{workspace.milestones.length ? <ul className="divide-y">{workspace.milestones.map(m => <li key={String(m.id)} className="py-3 first:pt-0"><p className="font-medium break-words">{String(m.title)}</p><p className="text-sm text-muted-foreground">{String(m.status).replaceAll("_", " ")} · {m.mandatory ? "Required" : "Optional"} · {String(m.responsible || "Unassigned")} · Due {displayDate(m.due_at)}</p>{Boolean(m.deliverable) && <p className="text-sm whitespace-pre-wrap break-words">Deliverable: {String(m.deliverable)}</p>}{Boolean(m.completion_evidence) && <p className="text-sm whitespace-pre-wrap break-words">Evidence: {String(m.completion_evidence)}</p>}{Boolean(m.review_feedback) && <p className="text-sm whitespace-pre-wrap break-words">Review feedback: {String(m.review_feedback)}</p>}{ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && ["pending", "in_progress"].includes(String(m.status)) && !p.archived_at && <ProjectFormDialog title="Edit milestone"><EditMilestone projectId={id} milestoneId={String(m.id)} version={String(m.version)} title={String(m.title)} deliverable={String(m.deliverable || "")} dueDate={String(m.due_date || "")} assigneeId={String(m.responsible_staff_id || "")} mandatory={Boolean(m.mandatory)} staff={staff} /></ProjectFormDialog>}{ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && !p.archived_at && ["pending", "in_progress", "awaiting_approval"].includes(String(m.status)) && (m.status !== "awaiting_approval" || ctx.role === "org:admin") && <ProjectFormDialog title={m.status === "awaiting_approval" ? "Review milestone" : "Submit for review"}><MilestoneReview projectId={id} milestoneId={String(m.id)} version={String(m.version)} status={String(m.status)} admin={ctx.role === "org:admin"} /></ProjectFormDialog>}</li>)}</ul> : <p className="text-sm text-muted-foreground">No milestones have been recorded.</p>}{ctx.permissions.includes("projects_write") && ["planned", "active", "on_hold"].includes(String(p.status)) && !p.archived_at && <ProjectFormDialog title="Add milestone"><CreateMilestone projectId={id} milestoneId={randomUUID()} staff={staff} /></ProjectFormDialog>}</CardContent></Card>
      </div>
      <section id="files" className="scroll-mt-6">
        <RecordDocuments type="project" id={id} label={`${String(p.code)} ${String(p.name)}`} />
      </section>
      <section id="financials" className="space-y-6 scroll-mt-6">
        {workspace.expenses ? <ProjectExpenses projectId={id} expenses={workspace.expenses} createAction={createExpense} /> : createExpense && <Card><CardHeader><CardTitle>Project expenses</CardTitle><CardDescription>Create an expense request for this project.</CardDescription></CardHeader><CardContent>{createExpense}</CardContent></Card>}
        {workspace.teamPayments && <ProjectTeamPayments rows={workspace.teamPayments} />}
      </section>
      <ProjectTeam projectId={id} currency={String(p.currency)} members={workspace.members} staff={staff} canManage={ctx.permissions.includes("projects_write") && !p.archived_at} showPay={showPay} />
        {workspace.invoices && <Card><CardHeader><CardTitle>Invoices</CardTitle><CardDescription>Most recent 50 project invoices; balances use the existing ledger.</CardDescription></CardHeader><CardContent>{workspace.invoices.length ? <ul className="space-y-2 text-sm">{workspace.invoices.map(i => <li key={String(i.id)}><Link className="underline underline-offset-4" href={`/admin/invoices/${i.id}`}>{String(i.number || "Draft")}</Link> · {String(i.status)} · {String(i.currency)} {String(i.total)} · Due {String(i.balance)}</li>)}</ul> : <p className="text-sm text-muted-foreground">No invoices linked to this project.</p>}</CardContent></Card>}
        <Card><CardHeader><CardTitle>Project activity</CardTitle><CardDescription>Most recent 50 project updates.</CardDescription></CardHeader><CardContent>{workspace.activity.length ? <ul className="space-y-2 text-sm">{workspace.activity.map((a,i) => <li key={i}>{activityLabels[String(a.action)] ?? "Project updated"} · {String(a.actor_name || (a.actor_type === "system" ? "System" : "Staff member"))} · {displayDate(a.created_at)}</li>)}</ul> : <p className="text-sm text-muted-foreground">No project activity has been recorded.</p>}</CardContent></Card>
    </PageContainer>
  );
}
