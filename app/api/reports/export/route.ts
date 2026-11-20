import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { staffContext } from "@/lib/sales/permissions";
import { readOperationalReport } from "@/lib/reports/operational";
import { toCsv } from "@/lib/reports/csv";

export const runtime = "nodejs";

/**
 * CSV export of one report table. Uses exactly the same read (and therefore the same
 * organization, section permission and filters) as the screen; exports are audited.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  let ctx: Awaited<ReturnType<typeof staffContext>>;
  let report: Awaited<ReturnType<typeof readOperationalReport>>;
  try {
    ctx = await staffContext();
    report = await readOperationalReport(raw);
  } catch { return new Response("Not found", { status: 404 }); }
  if (report.section !== raw.section) return new Response("Not found", { status: 404 });
  const table = report.tables.find((t) => t.key === raw.table);
  if (!table) return new Response("Not found", { status: 404 });
  const f = report.filters;
  const preamble = [`Calacot operational report: ${table.title}`, `Period ${f.from} to ${f.to}${f.division ? `; division ${f.division}` : ""}${f.projectId ? "; one project" : ""}${f.currency ? `; currency ${f.currency}` : "; UGX and USD reported separately"}`, "Operational report from system records. Not an audited financial statement.", ""];
  await db.execute(sql`INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id) VALUES(${ctx.organizationId},${ctx.actor},'staff','report.export','report',${`${report.section}:${table.key}`},${JSON.stringify({ from: f.from, to: f.to, division: f.division || null, projectId: f.projectId || null, currency: f.currency || null, rows: table.rows.length })}::jsonb,${randomUUID()})`);
  return new Response(toCsv(table.columns, table.rows, preamble), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="calacot-${report.section}-${table.key}-${f.from}-to-${f.to}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
