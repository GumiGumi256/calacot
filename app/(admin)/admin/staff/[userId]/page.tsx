import Link from "next/link";
import { notFound } from "next/navigation";
import { readStaffActivity, readStaffDirectory } from "@/lib/admin/staff";
import { roleLabel, staffRoles } from "@/lib/admin/roles";
import { ChangeRole, EmployeeEligibility, RemoveMember, StaffProfileForm, StaffStatusControl } from "@/components/admin/staff-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { staffContext } from "@/lib/sales/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { PageContainer } from "@/components/layout/page-container";
import { StatusBadge } from "@/components/ui/status-badge";

const actionLabels: Record<string, string> = {
  "staff.invite": "Invited", "staff.role_change": "Role changed", "staff.remove": "Removed from organization", "staff.suspend": "Access suspended", "staff.reactivate": "Suspension lifted",
  "staff.profile": "Profile updated", "staff.eligibility_approve": "Approved as employee", "staff.eligibility_revoke": "Employee approval revoked", "staff.sync_added": "Joined (from Clerk)", "staff.sync_role": "Role synchronized from Clerk", "staff.sync_removed": "Membership ended (from Clerk)",
};

export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const id = decodeURIComponent(userId);
  if (!/^user_[A-Za-z0-9]{1,64}$/.test(id)) notFound();
  const d = await readStaffDirectory({});
  const s = d.rows.find((r) => r.userId === id);
  if (!s) notFound();
  const ctx = await staffContext("staff_manage");
  const activity = s.staffId ? await readStaffActivity(ctx.organizationId, s.staffId) : [];
  const self = s.userId === d.actor;
  const live = s.status !== "removed";
  const editable = d.clerkAvailable && !self;
  return (
    <PageContainer>
      <Link href="/admin/staff" className="text-sm underline-offset-4 hover:underline">Back to staff</Link>
      <PageHeader
        title={s.name}
        description={s.email}
        meta={<StatusBadge domain="staff" status={s.status} />}
      />
      <Card>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>Role: <span className="font-medium">{roleLabel(s.role)}</span>. {staffRoles.find((r) => r.key === s.role)?.summary}</p>
          {s.status === "suspended" && <p>Suspended: {s.suspensionReason ?? "No reason recorded"}. Access is refused even though the Clerk membership remains.</p>}
          {s.status === "removed" && <p>No longer a member in Clerk. Invite them again to restore access.</p>}
          {self && <p className="text-muted-foreground">This is your own account. Another administrator must change your role, status or membership.</p>}
          <p className="text-xs text-muted-foreground">Last synchronized from Clerk: {s.lastSyncedAt?.slice(0, 19).replace("T", " ") ?? "never"}</p>
        </CardContent>
      </Card>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {s.staffId && (
          <Card><CardHeader><CardTitle>Profile and division</CardTitle></CardHeader>
            <CardContent>{d.clerkAvailable ? <StaffProfileForm staffId={s.staffId} version={s.version} division={s.division ?? ""} jobTitle={s.jobTitle ?? ""} responsibilities={s.responsibilities ?? ""} /> : <p className="text-sm text-muted-foreground">Unavailable while Clerk cannot be reached.</p>}</CardContent>
          </Card>
        )}
        {editable && live && (
          <Card><CardHeader><CardTitle>Access</CardTitle><CardDescription>Role changes are made in Clerk and logged here.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-6">
              {s.status === "active" && <ChangeRole userId={s.userId} current={s.role ?? ""} available={d.configuredRoles} actorIsAdmin={d.actorRole === "org:admin"} />}
              {s.staffId && s.status === "active" && s.role === "org:member" && <EmployeeEligibility staffId={s.staffId} version={s.version} eligibility={s.eligibility} />}
              {s.staffId && <StaffStatusControl staffId={s.staffId} version={s.version} status={s.status} />}
              <div><RemoveMember userId={s.userId} name={s.name} /></div>
            </CardContent>
          </Card>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle>Administrative history</CardTitle><CardDescription>Most recent 30 events.</CardDescription></CardHeader>
        <CardContent>
          {activity.length ? (
            <ol className="flex flex-col gap-2 text-sm">
              {activity.map((a, i) => (
                <li key={i} className="border-l-2 pl-3">
                  <p className="font-medium">{actionLabels[a.action] ?? a.action}{["staff.role_change", "staff.sync_role"].includes(a.action) ? `:${roleLabel(String(a.changes.from ?? a.changes.roleFrom ?? "none"))} to ${roleLabel(String(a.changes.to ?? a.changes.roleTo ?? "none"))}` : ""}</p>
                  <p className="text-muted-foreground">{a.actor}, {a.created_at.slice(0, 16).replace("T", " ")}{a.changes?.reason ? `. Reason: ${String(a.changes.reason)}` : ""}</p>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-muted-foreground">No administrative history recorded yet.</p>}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
