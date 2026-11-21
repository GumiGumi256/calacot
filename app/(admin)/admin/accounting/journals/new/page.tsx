import { randomUUID } from "node:crypto";
import { readJournalForm } from "@/lib/accounting/reads";
import { JournalForm } from "@/components/accounting/journal-form";
import { ReadinessPanel } from "@/components/accounting/shared";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

export default async function Page() {
  const d = await readJournalForm();
  return (
    <PageContainer width="reading">
      <PageHeader title="New journal" description="Prepare a manual journal. Saving creates a draft; it reaches the ledger only after someone else approves it and it is posted." />
      <ReadinessPanel readiness={d.readiness} compact />
      {d.accounts.length === 0 ? (
        <EmptyState kind="no-records" title="No accounts available" description="Load or propose the chart of accounts first. Control accounts (receivables, payables, unallocated receipts) are not offered for manual journals." />
      ) : (
        <JournalForm requestKey={randomUUID()} today={d.readiness.today} functionalCurrency={d.readiness.policy?.functional_currency ?? null} accounts={d.accounts} projects={d.projects} rates={d.rates} draft={null} />
      )}
    </PageContainer>
  );
}
