import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { parseQuery, type Entity } from "@/lib/sales/contracts";
import { readList } from "@/lib/sales/reads";
import { staffContext } from "@/lib/sales/permissions";
import { db } from "@/database/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { PageContainer } from "@/components/layout/page-container";
import { SalesTable, type SalesTableEntity } from "./sales-table";
import { ClientForm } from "./client-form";
import { ProjectSheet } from "./project-sheet";

/** Page headings match the sidebar labels (the real text, not CSS capitalisation). */
const pages: Record<SalesTableEntity, { title: string; description: string }> = {
  clients: { title: "Clients", description: "Everyone Calacot works for, with their contacts, active projects and what they owe." },
  projects: { title: "Projects", description: "Planned and running work across every division." },
  invoices: { title: "Invoices", description: "Issue invoices and follow what is still outstanding." },
  deliveries: { title: "Delivery operations", description: "Email and WhatsApp messages sent to clients. Delivery status is separate from acceptance, payment and project execution." },
};

export async function SalesListPage({
  entity,
  searchParams,
  before,
}: {
  entity: Exclude<Entity, "quotations">;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  /** Optional read-only content rendered above the list (e.g. receivables overview). */
  before?: ReactNode;
}) {
  const raw = await searchParams,
    query = parseQuery(raw),
    data = await readList(entity, query);
  if (data.query.page !== query.page) {
    const p = new URLSearchParams(Object.entries(raw).filter((v): v is [string, string] => typeof v[1] === "string"));
    p.set("page", String(data.query.page));
    redirect(`/admin/${entity}?${p}`);
  }
  let selectedClient: { id: string; name: string } | undefined;
  const canCreateProject = entity === "projects" && data.permissions.includes("projects_write");
  const initialOpen = canCreateProject && raw.new === "1";
  if (initialOpen && typeof raw.clientId === "string" && z.uuid().safeParse(raw.clientId).success) {
    const ctx = await staffContext("projects_write");
    selectedClient = (await db.execute<{ id: string; name: string }>(sql`SELECT id,display_name AS name FROM clients WHERE id=${raw.clientId}::uuid AND organization_id=${ctx.organizationId} AND archived_at IS NULL`)).rows[0];
  }
  const create =
    entity === "clients" && data.permissions.includes("clients_write") ? <ClientForm /> :
    canCreateProject ? <ProjectSheet initialOpen={initialOpen} selectedClient={selectedClient} /> :
    undefined;
  const exportHref = ["invoices", "clients"].includes(entity)
    ? `/api/sales/${entity}/export?${new URLSearchParams(Object.entries(data.query).map(([k, v]) => [k, String(v)]))}`
    : undefined;
  return (
    <PageContainer>
      <PageHeader
        title={pages[entity].title}
        description={pages[entity].description}
        secondaryActions={
          exportHref && (
            <Button variant="outline" nativeButton={false} render={<a href={exportHref} />} title="Downloads up to 1,000 matching records as CSV">
              <DownloadIcon /> Export CSV
            </Button>
          )
        }
        primaryAction={create}
      />
      {before}
      <SalesTable entity={entity} rows={data.rows} total={data.total} query={data.query} summary={data.summary} />
    </PageContainer>
  );
}
