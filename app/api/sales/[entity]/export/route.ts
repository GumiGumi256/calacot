import { staffContext } from "@/lib/sales/permissions";
import { db } from "@/database/db";
import { parseQuery, type Entity, type ListRow } from "@/lib/sales/contracts";
import { listQueries } from "@/lib/sales/queries";
export const runtime = "nodejs";
const cell = (s: unknown) =>
  `"${String(s ?? "")
    .replace(/^[=+@-]/, "'$&")
    .replaceAll('"', '""')}"`;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const { entity } = await params;
  if (!["clients", "projects", "quotations", "invoices"].includes(entity))
    return new Response("Not found", { status: 404 });
  const ctx = await staffContext(
    `${entity as Exclude<Entity, "deliveries">}_read`,
  );
  const query = parseQuery(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  query.size = 100;
  const requests = listQueries(ctx.organizationId, entity as Entity, query);
  const all: ListRow[] = [];
  for (let p = 1; p <= 10; p++) {
    const r = await db.execute<ListRow>(requests.rows(p));
    all.push(...r.rows);
    if (r.rows.length < 100) break;
  }
  const keys = [
    "id",
    "name",
    "number",
    "client",
    "project",
    "status",
    "currency",
    "total",
    "balance",
    "payment",
    "delivery",
  ] as const;
  return new Response(
    [
      keys.join(","),
      ...all.map((r) => keys.map((k) => cell(r[k])).join(",")),
    ].join("\r\n"),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${entity}.csv`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
