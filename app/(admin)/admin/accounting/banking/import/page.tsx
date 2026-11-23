import { readImportPage, type SearchParams } from "@/lib/banking/reads";
import { AccountingNav } from "@/components/accounting/shared";
import { BankingNav } from "@/components/banking/shared";
import { StatementImport } from "@/components/banking/statement-import";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [d, raw] = await Promise.all([readImportPage(), searchParams]);
  const initial = typeof raw.account === "string" ? raw.account : undefined;
  return (
    <PageContainer>
      <PageHeader
        title="Import a statement"
        description="Upload a bank or mobile-money statement, check how its columns are read, preview it, then import. Importing records the statement only: it never creates journals, and the same file is never imported twice."
      />
      <AccountingNav current="/admin/accounting/banking" />
      <BankingNav current="/admin/accounting/banking/import" />
      {d.accounts.length === 0
        ? <EmptyState kind="no-records" title="No bank or mobile-money accounts" description="Register an account and have its ledger mapping approved before importing statements." />
        : <StatementImport accounts={d.accounts} initialAccount={initial} />}
    </PageContainer>
  );
}
