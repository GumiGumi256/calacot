import Link from "next/link";
import { readJournals, journalStatuses, type SearchParams } from "@/lib/accounting/reads";
import { AccountingNav } from "@/components/accounting/shared";
import { JournalTable } from "@/components/accounting/journal-table";
import { FilterBar, Pager } from "@/components/admin/list-controls";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resolveStatus } from "@/lib/ui/status";

const viewLabels: Record<string, string> = { all: "All journals", mine: "Prepared by me", review: "Awaiting my approval", ready: "Approved, not posted" };

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await readJournals(await searchParams);
  const views = ["all", ...(d.can.prepare ? ["mine"] : []), ...(d.can.approve ? ["review"] : []), ...(d.can.post ? ["ready"] : [])];
  const filtered = !!(d.filters.search || d.filters.status || d.filters.type || d.filters.from || d.filters.to);
  return (
    <PageContainer>
      <PageHeader
        title="Journals"
        description="Manual journals move from draft to approval to posting. Posted journals are numbered, permanent and corrected only by reversal."
        primaryAction={d.can.prepare && <Button render={<Link href="/admin/accounting/journals/new" />}>New journal</Button>}
      />
      <AccountingNav current="/admin/accounting/journals" />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <nav aria-label="Journal views" className="flex flex-wrap gap-2">
            {views.map((v) => (
              <Button key={v} size="sm" variant={d.filters.view === v ? "default" : "outline"} render={<Link href={`?view=${v}`} aria-current={d.filters.view === v ? "page" : undefined} />}>
                {viewLabels[v]}{v === "review" && d.counts.review ? ` (${d.counts.review})` : ""}{v === "ready" && d.counts.ready ? ` (${d.counts.ready})` : ""}
              </Button>
            ))}
          </nav>
          <FilterBar
            reset={`?view=${d.filters.view}`}
            values={d.filters}
            hidden={{ view: d.filters.view }}
            fields={[
              { name: "search", label: "Search number, description or reference", type: "search" },
              { name: "status", label: "Status", type: "select", options: journalStatuses, labels: Object.fromEntries(journalStatuses.map((s) => [s, resolveStatus("journal", s).label])) },
              { name: "type", label: "Type", type: "select", options: ["manual", "reversal"], labels: { manual: "Manual", reversal: "Reversal" } },
              { name: "from", label: "From date", type: "date" },
              { name: "to", label: "Through date", type: "date" },
            ]}
          />
          {d.rows.length ? <JournalTable rows={d.rows} /> : (
            <EmptyState
              kind={filtered ? "filtered-out" : "no-records"}
              title={filtered ? undefined : d.filters.view === "review" ? "Nothing awaiting your approval" : d.filters.view === "ready" ? "No approved journals waiting" : "No journals yet"}
              action={filtered ? <Button variant="outline" render={<Link href={`?view=${d.filters.view}`} />}>Clear filters</Button> : undefined}
            />
          )}
          <Pager path="" params={{ ...d.filters }} page={d.page} size={d.size} total={d.total} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
