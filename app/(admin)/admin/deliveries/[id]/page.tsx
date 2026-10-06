import { sql } from "drizzle-orm";
import { z } from "zod";
import { notFound } from "next/navigation";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { Deliveries } from "@/components/sales/activity";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await staffContext("notifications_manage");
  if (!z.uuid().safeParse(id).success) notFound();
  const d = await db.execute(
    sql`SELECT d.*,coalesce((SELECT jsonb_agg(jsonb_build_object('attempt',a.attempt,'state',a.state,'code',a.code,'at',a.created_at) ORDER BY a.created_at) FROM delivery_attempts a WHERE a.organization_id=d.organization_id AND a.intent_id=d.id),'[]') AS attempts FROM delivery_intents d WHERE d.id=${id}::uuid AND d.organization_id=${ctx.organizationId}`,
  );
  if (!d.rows.length) notFound();
  return (
    <main className="p-4 md:p-6">
      <Deliveries rows={d.rows} permissions={ctx.permissions} />
    </main>
  );
}
