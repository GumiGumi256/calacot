import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { financeContext } from "@/lib/finance/context";
import { disbursementMethodLabels } from "@/lib/finance/options";
import { AccountStatus, RegisterAccount } from "@/components/finance/account-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { PageContainer } from "@/components/layout/page-container";

export default async function Page() {
  const ctx = await financeContext(["finance_accounts_manage"]);
  const accounts = await db.execute<{ id: string; method: string; provider: string; account_identifier: string; label: string; currency: string; status: string; verified_by: string; verified_at: string; verification_note: string }>(sql`SELECT a.id,a.method,a.provider,a.account_identifier,a.label,a.currency,a.status,coalesce(s.display_name,s.clerk_user_id) AS verified_by,a.verified_at::text AS verified_at,a.verification_note
    FROM finance_accounts a LEFT JOIN staff_memberships s ON s.id=a.verified_by_id AND s.organization_id=a.organization_id WHERE a.organization_id=${ctx.organizationId} ORDER BY a.status,a.method,a.label,a.id LIMIT 200`);
  return (
    <PageContainer>
      <PageHeader
        title="Payment accounts"
        description="Verified company accounts used to pay expenses. Bank, mobile-money and cheque disbursements must name one; a transaction reference can be recorded only once per method and account."
        primaryAction={<RegisterAccount requestKey={randomUUID()} />}
      />
      <Card>
        <CardContent className="overflow-x-auto">
          {accounts.rows.length ? (
            <Table>
              <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Method</TableHead><TableHead>Currency</TableHead><TableHead>Verification</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {accounts.rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><span className="font-medium">{a.label}</span><div className="text-xs text-muted-foreground">{a.provider} {a.account_identifier}</div></TableCell>
                    <TableCell>{disbursementMethodLabels[a.method] ?? a.method}</TableCell>
                    <TableCell>{a.currency}</TableCell>
                    <TableCell className="max-w-72 text-xs">{a.verified_by}, {a.verified_at.slice(0, 10)}<div className="text-muted-foreground break-words">{a.verification_note}</div></TableCell>
                    <TableCell><Badge variant={a.status === "active" ? "default" : "secondary"}>{a.status === "active" ? "Active" : "Inactive"}</Badge></TableCell>
                    <TableCell><AccountStatus accountId={a.id} status={a.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">No payment accounts registered. Bank, mobile-money and cheque disbursements cannot be recorded until one is registered.</p>}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
