import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { parseQuery, type Entity } from "@/lib/sales/contracts";
import { readList } from "@/lib/sales/reads";
import { staffContext } from "@/lib/sales/permissions";
import { db } from "@/database/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { EntityList } from "./entity-list";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
/** Page headings match the sidebar labels (the real text, not CSS capitalisation). */
const entityTitles: Record<Entity, string> = {
  clients: "Clients",
  projects: "Projects",
  quotations: "Quotations",
  invoices: "Invoices",
  deliveries: "Delivery operations",
};
export async function SalesListPage({
  entity,
  searchParams,
  before,
}: {
  entity: Entity;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  /** Optional read-only content rendered above the list (e.g. receivables overview). */
  before?: ReactNode;
}) {
  const raw = await searchParams,
    query = parseQuery(raw),
    data = await readList(entity, query);
  if (data.query.page !== query.page) {
    const p = new URLSearchParams(
      Object.entries(raw).filter(
        (v): v is [string, string] => typeof v[1] === "string",
      ),
    );
    p.set("page", String(data.query.page));
    redirect(`/admin/${entity}?${p}`);
  }
  let selectedClient: { id: string; name: string } | undefined;
  const initialOpen = entity === "projects" && raw.new === "1" && data.permissions.includes("projects_write");
  if (initialOpen && typeof raw.clientId === "string" && z.uuid().safeParse(raw.clientId).success) {
    const ctx = await staffContext("projects_write");
    selectedClient = (await db.execute<{id:string;name:string}>(sql`SELECT id,display_name AS name FROM clients WHERE id=${raw.clientId}::uuid AND organization_id=${ctx.organizationId} AND archived_at IS NULL`)).rows[0];
  }
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {before}
      <Card>
        <CardHeader>
          <CardTitle as="h1">{entityTitles[entity]}</CardTitle>
          <CardDescription>
            {entity === "deliveries"
              ? "Delivery status is separate from acceptance, payment and project execution."
              : "Search, filter and review organization records."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntityList entity={entity} {...data} projectSheet={entity === "projects" ? { initialOpen, selectedClient } : undefined} />
        </CardContent>
        <CardFooter className="flex flex-wrap gap-6">
          {data.summary.map((s) => (
            <p key={s.currency}>
              {s.currency}: {s.total} matching total
              {entity === "invoices" ? ` · ${s.due} outstanding` : ""}
            </p>
          ))}
        </CardFooter>
      </Card>
    </div>
  );
}
