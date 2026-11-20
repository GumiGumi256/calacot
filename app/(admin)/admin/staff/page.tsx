import Link from "next/link";
import { readStaffDirectory } from "@/lib/admin/staff";
import { roleLabel, staffRoles } from "@/lib/admin/roles";
import { InviteStaff, RevokeInvitation } from "@/components/admin/staff-forms";
import { RefreshStaff } from "@/components/admin/refresh-staff";
import { FilterBar } from "@/components/admin/list-controls";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AttentionStrip } from "@/components/layout/attention-strip";

const day = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : "-");

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const d = await readStaffDirectory(await searchParams);
  return (
    <PageContainer>
      <PageHeader
        title="Staff"
        description="Invite employees, set their role and division, and manage their access. Clerk holds sign-in and membership; this page is where you manage them."
        secondaryActions={d.actorRole === "org:admin" && <RefreshStaff />}
        primaryAction={d.clerkAvailable && <InviteStaff available={d.configuredRoles} actorIsAdmin={d.actorRole === "org:admin"} />}
        meta={
          <ul aria-label="Staff summary" className="flex flex-wrap gap-x-4 gap-y-1 type-caption">
            <li><span className="font-semibold text-foreground tabular-nums">{d.counts.active}</span> active</li>
            <li><span className="font-semibold text-foreground tabular-nums">{d.counts.invited}</span> invitation{d.counts.invited === 1 ? "" : "s"} pending</li>
            <li><span className="font-semibold text-foreground tabular-nums">{d.counts.suspended}</span> suspended</li>
          </ul>
        }
      />
      {!d.clerkAvailable && (
        <p role="alert" className="rounded-(--card-radius-inner) border border-destructive-border bg-destructive-soft p-3 type-body text-destructive-text">
          Clerk could not be reached. Showing the last synced staff list; inviting and changing access are disabled until Clerk is available.
        </p>
      )}
      <AttentionStrip
        items={
          d.counts.awaitingApproval > 0
            ? [{ key: "approval", count: d.counts.awaitingApproval, label: d.counts.awaitingApproval === 1 ? "new employee is waiting for your approval (open them below and choose Manage)" : "new employees are waiting for your approval (open them below and choose Manage)", tone: "warning" }]
            : []
        }
      />
      <Card>
        <CardHeader>
          <CardTitle as="h2">Team</CardTitle>
          <CardDescription>Search and filter everyone with access. Choose Manage to change someone&rsquo;s role, division or access.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FilterBar reset="?" values={d.filters} fields={[
            { name: "search", label: "Search", type: "search" },
            { name: "status", label: "Status", type: "select", options: ["active", "invited", "suspended", "removed"] },
            { name: "role", label: "Role", type: "select", options: staffRoles.map((r) => r.key), labels: Object.fromEntries(staffRoles.map((r) => [r.key, r.label])) },
            { name: "division", label: "Division", type: "select", options: ["estates", "architecture", "painting", "interiors", "tech"] },
          ]} />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Role</TableHead><TableHead>Division / title</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {d.rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No staff match these filters.</TableCell></TableRow>}
                {d.rows.map((s) => (
                  <TableRow key={s.userId}>
                    <TableCell><span className="font-medium">{s.name}</span>{s.userId === d.actor && <span className="text-xs text-muted-foreground"> (you)</span>}<div className="text-xs text-muted-foreground break-all">{s.email}</div></TableCell>
                    <TableCell>{roleLabel(s.role)}</TableCell>
                    <TableCell><span className="capitalize">{s.division ?? "Not assigned"}</span>{s.jobTitle && <div className="text-xs text-muted-foreground">{s.jobTitle}</div>}</TableCell>
                    <TableCell><span className="flex flex-wrap items-center gap-1"><StatusBadge domain="staff" status={s.status} />{s.status === "active" && s.role === "org:member" && s.eligibility !== "approved" && <Badge variant="warning">Awaiting approval</Badge>}</span></TableCell>
                    <TableCell className="text-right"><Link className="text-sm font-medium underline-offset-4 hover:underline" href={`/admin/staff/${encodeURIComponent(s.userId)}`}>Manage<span className="sr-only"> {s.name}</span></Link></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle as="h2">Invitations</CardTitle><CardDescription>Pending invitations expire after 7 days. Accepted invitations appear in the staff list once the person joins.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {d.invitations.length ? (
            <ul className="divide-y text-sm">
              {d.invitations.map((i) => <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><span className="break-all">{i.email}</span> <Badge variant="outline">Invited</Badge><span className="block text-xs text-muted-foreground">{roleLabel(i.role)}, sent {day(i.createdAt)}, expires {day(i.expiresAt)}</span></span>{d.clerkAvailable && <RevokeInvitation invitationId={i.id} />}</li>)}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No pending invitations.</p>}
          {d.recentInvitations.length > 0 && (
            <details className="text-sm"><summary className="cursor-pointer font-medium">Recent invitation outcomes</summary>
              <ul className="mt-2 flex flex-col gap-1">{d.recentInvitations.map((i) => <li key={i.id}>{i.email}: {i.status} ({roleLabel(i.role)}, sent {day(i.createdAt)})</li>)}</ul>
            </details>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
