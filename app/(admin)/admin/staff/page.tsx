import Link from "next/link";
import { readStaffDirectory } from "@/lib/admin/staff";
import { roleLabel, staffRoles } from "@/lib/admin/roles";
import { InviteStaff, RevokeInvitation } from "@/components/admin/staff-forms";
import { RefreshStaff } from "@/components/admin/refresh-staff";
import { FilterBar } from "@/components/admin/list-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statusBadge = { active: { label: "Active", variant: "default" }, suspended: { label: "Suspended", variant: "destructive" }, removed: { label: "Removed", variant: "secondary" } } as const;
const day = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : "-");

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const d = await readStaffDirectory(await searchParams);
  return (
    <main className="flex flex-col gap-4 p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Staff</CardTitle>
            <CardDescription>Employees, their roles and access. Clerk is the source of truth for membership and roles; profiles here are for coordination.</CardDescription>
          </div>
          {d.clerkAvailable && <InviteStaff available={d.configuredRoles} actorIsAdmin={d.actorRole === "org:admin"} />}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!d.clerkAvailable && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm">Clerk could not be reached. Showing the last synced staff list; changes are disabled until Clerk is available.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>{d.counts.active} active ({d.counts.awaitingApproval} awaiting employee approval), {d.counts.suspended} suspended, {d.counts.invited} invitation(s) pending</p>
            {d.actorRole === "org:admin" && <RefreshStaff />}
          </div>
          <FilterBar reset="?" values={d.filters} fields={[
            { name: "search", label: "Search", type: "search" },
            { name: "status", label: "Status", type: "select", options: ["active", "invited", "suspended", "removed"] },
            { name: "role", label: "Role", type: "select", options: staffRoles.map((r) => r.key) },
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
                    <TableCell><Badge variant={statusBadge[s.status].variant}>{statusBadge[s.status].label}</Badge>{s.status === "active" && s.role === "org:member" && s.eligibility !== "approved" && <Badge variant="outline" className="ml-1">Awaiting approval</Badge>}</TableCell>
                    <TableCell><Link className="text-sm underline underline-offset-4" href={`/admin/staff/${encodeURIComponent(s.userId)}`}>Manage</Link></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Invitations</CardTitle><CardDescription>Pending invitations expire after 7 days. Accepted invitations appear in the staff list once the person joins.</CardDescription></CardHeader>
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
    </main>
  );
}
