import { RefreshStaff } from "@/components/admin/refresh-staff";
import { readLeads, type SearchParams } from "@/lib/admin/reads";
import { LeadUpdateForm } from "@/components/admin/lead-update-form";
import { LeadConversion } from "@/components/admin/lead-conversion";
import Link from "next/link";
import { label, leadStatuses, leadTypes } from "@/lib/admin/options";
import { FilterBar, Pager, fmtDate } from "@/components/admin/list-controls";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const data = await readLeads(await searchParams);
  const counts = Object.fromEntries(data.stats.map((s) => [s.status, s.count]));
  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Leads</CardTitle>
          <CardDescription>
            Enquiries from the scheduling, project and contact forms.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.canRefreshStaff && <RefreshStaff />}
          <div className="flex flex-wrap gap-2">
            {leadStatuses.map((s) => (
              <Badge key={s} variant="secondary" className="capitalize">
                {label(s)}: {counts[s] ?? 0}
              </Badge>
            ))}
          </div>
          <FilterBar
            reset="?"
            values={data.filters}
            fields={[
              { name: "search", label: "Search", type: "search" },
              { name: "status", label: "Status", type: "select", options: leadStatuses },
              { name: "type", label: "Source", type: "select", options: leadTypes },
              { name: "division", label: "Department", type: "select", options: ["estates", "architecture", "painting", "interiors", "tech"] },
              { name: "followUp", label: "Follow-up date", type: "date" },
            ]}
          />
          <form method="get" className="flex flex-wrap items-end gap-2"><label htmlFor="assignee-filter">Assigned employee</label><select id="assignee-filter" name="assignee" defaultValue={data.filters.assignee} className="h-9 rounded-md border px-3"><option value="">All</option><option value="unassigned">Unassigned</option>{data.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="rounded-md border px-3 py-2" type="submit">Filter</button></form>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">
                      No leads match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {data.rows.map((l) => (
                  <TableRow key={l.id} className="align-top">
                    <TableCell className="font-medium">{l.full_name}</TableCell>
                    <TableCell>
                      <div>{l.email}</div>
                      <div className="text-muted-foreground">{l.phone}</div>
                    </TableCell>
                    <TableCell className="capitalize">{l.service}</TableCell>
                    <TableCell className="capitalize">{label(l.type)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {label(l.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{fmtDate(l.created_at)}</TableCell>
                    <TableCell className="min-w-64 whitespace-normal">
                      <p className="text-sm text-muted-foreground">{data.staff.find(s => s.id === l.assigned_staff_id)?.name ?? (l.assigned_staff_id ? "Unavailable employee" : "Unassigned")}{l.follow_up_on && <> · Follow-up {l.follow_up_on}{l.overdue && <strong className="text-destructive"> overdue</strong>}</>}</p>
                      <details>
                        <summary className="cursor-pointer text-sm">Open</summary>
                        <dl className="mt-2 flex flex-col gap-1 text-sm">
                          {l.preferred_date && (
                            <p>
                              Preferred: {fmtDate(l.preferred_date)} {l.preferred_time}
                            </p>
                          )}
                          {l.project_location && <p>Location: {l.project_location}</p>}
                          {l.estimated_budget && <p>Budget: {l.estimated_budget}</p>}
                          {l.timeline && <p>Timeline: {l.timeline}</p>}
                          {l.project_overview && <p>{l.project_overview}</p>}
                        </dl>
                        {data.canWrite && (
                          <LeadUpdateForm id={l.id} status={l.status} notes={l.admin_notes ?? ""} division={l.division ?? ""} assignee={l.assigned_staff_id ?? ""} followUpOn={l.follow_up_on ?? ""} followUpNotes={l.follow_up_notes ?? ""} staff={data.staff} />
                        )}
                        {l.follow_up_on && <p className="mt-2 text-sm">Follow-up: {l.follow_up_on} {l.overdue && <strong className="text-destructive">Overdue</strong>} {l.follow_up_notes}</p>}
                        {l.client_id ? <p className="mt-3"><Link className="underline" href={`/admin/clients/${l.client_id}`}>Open linked client</Link>{data.canProject && <> · <Link className="underline" href={`/admin/projects/new?clientId=${l.client_id}`}>Create project</Link></>}</p> : data.canConvert && l.status === "qualified" ? <LeadConversion id={l.id} name={l.full_name} email={l.email} phone={l.phone} division={l.division ?? ""} canProject={data.canProject} /> : null}
                        <h3 className="mt-4 text-sm font-medium">Recent activity</h3>{l.activity.length ? <ul className="mt-2 space-y-2 text-sm">{l.activity.map((event, index) => <li key={`${event.created_at}-${index}`}>{label(event.action)} · {event.actor} · {fmtDate(event.created_at)}{Object.keys(event.changes).length > 0 && <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(event.changes, null, 2)}</pre>}</li>)}</ul> : <p className="text-sm text-muted-foreground">No recorded activity.</p>}
                      </details>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager
            path=""
            params={{ ...data.filters, size: String(data.size) }}
            page={data.page}
            size={data.size}
            total={data.total}
          />
        </CardContent>
      </Card>
    </main>
  );
}
