import { randomUUID } from "node:crypto";
import { readJournalForm } from "@/lib/accounting/reads";
import { JournalForm } from "@/components/accounting/journal-form";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await readJournalForm(id);
  const draft = d.draft!;
  return (
    <PageContainer width="reading">
      <PageHeader title="Edit draft journal" description="Only the preparer can edit a draft. Saving replaces all lines and starts a new version." />
      <JournalForm requestKey={randomUUID()} today={d.readiness.today} functionalCurrency={d.readiness.policy?.functional_currency ?? null} accounts={d.accounts} projects={d.projects} rates={d.rates} draft={draft} />
    </PageContainer>
  );
}
