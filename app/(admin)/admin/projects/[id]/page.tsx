import Link from "next/link";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { notFound } from "next/navigation";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { ProjectStart } from "@/components/sales/project-start";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await staffContext("projects_read");
  if (!z.uuid().safeParse(id).success) notFound();
  const p = (
    await db.execute(
      sql`SELECT p.*,c.display_name AS client_name FROM projects p JOIN clients c ON c.id=p.client_id AND c.organization_id=p.organization_id WHERE p.id=${id}::uuid AND p.organization_id=${ctx.organizationId}`,
    )
  ).rows[0];
  if (!p) notFound();
  return (
    <main className="p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>{String(p.name)}</CardTitle>
          <CardDescription>
            {String(p.code)} · Execution: {String(p.status)} · Agreement:{" "}
            {p.quotation_version_id ? "Confirmed" : "Pre-sales"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Link href={`/admin/clients/${p.client_id}`}>
            {String(p.client_name)}
          </Link>
          <p>{String(p.scope || "")}</p>
          <p>
            {String(p.division)} · {String(p.currency)} · Start:{" "}
            {String(p.starts_on || "Not scheduled")}
          </p>
          <Link href={`/admin/quotations?clientId=${p.client_id}`}>
            Client quotations
          </Link>
          {ctx.permissions.includes("projects_write") &&
            p.status === "planned" &&
            !!p.quotation_version_id && <ProjectStart id={id} />}
        </CardContent>
      </Card>
    </main>
  );
}
