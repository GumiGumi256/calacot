import { readLeads, type SearchParams } from "@/lib/admin/reads";
import { updateLead } from "@/lib/admin/actions";
import { label, leadStatuses, leadTypes } from "@/lib/admin/options";
import { FilterBar, Pager, fmtDate } from "@/components/admin/list-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
            ]}
          />
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
                          <form action={updateLead} className="mt-3 flex flex-col gap-2">
                            <input type="hidden" name="id" value={l.id} />
                            <select
                              name="status"
                              defaultValue={l.status}
                              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm capitalize"
                            >
                              {leadStatuses.map((s) => (
                                <option key={s} value={s}>
                                  {label(s)}
                                </option>
                              ))}
                            </select>
                            <Textarea
                              name="adminNotes"
                              defaultValue={l.admin_notes ?? ""}
                              placeholder="Internal notes"
                              maxLength={4000}
                            />
                            <Button type="submit" size="sm">
                              Save
                            </Button>
                          </form>
                        )}
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
