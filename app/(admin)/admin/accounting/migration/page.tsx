import Link from "next/link";
import { readMigration } from "@/lib/migration/reads";
import { migrationSourceSystems } from "@/lib/accounting/migration";
import { AccountingNav } from "@/components/accounting/shared";
import { CreateBatch } from "@/components/migration/forms";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function Page() {
  const d = await readMigration();
  return (
    <PageContainer>
      <PageHeader title="Opening balances" description="Stage, reconcile and approve the opening position from Calacot's historical records. Staging never posts to the ledger; the opening journal is a separate, reviewed activation step."
        primaryAction={d.can.prepare ? <CreateBatch /> : undefined} />
      <AccountingNav current="/admin/accounting/migration" />
      <Card>
        <CardHeader><CardTitle as="h2">Batches</CardTitle><CardDescription>One batch can be approved at a time. A newer approval supersedes the older batch, which stays in the history.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          {d.batches.length === 0 ? <p className="text-sm text-muted-foreground">No opening-balance batch has been staged. No opening balances exist in the system.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Cutoff</TableHead><TableHead>Source</TableHead><TableHead>Rows</TableHead><TableHead>Status</TableHead><TableHead>Prepared by</TableHead></TableRow></TableHeader>
              <TableBody>{d.batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell><Link className="font-medium underline-offset-4 hover:underline" href={`/admin/accounting/migration/${b.id}`}>{b.cutoff_date}</Link></TableCell>
                  <TableCell className="min-w-56 whitespace-normal text-sm">{migrationSourceSystems[b.source_system as keyof typeof migrationSourceSystems] ?? b.source_system}<span className="block text-xs text-muted-foreground">{b.source_description}</span></TableCell>
                  <TableCell className="tabular-nums">{b.rows}</TableCell>
                  <TableCell><StatusBadge domain="migrationBatch" status={b.status} /></TableCell>
                  <TableCell className="text-sm">{b.prepared_by}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
