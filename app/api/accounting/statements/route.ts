import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/database/db";
import { fsContext, readStatementForExport } from "@/lib/statements/reads";
import { flattenStatement, reportTypes, type ReportType } from "@/lib/accounting/statements";
import { csvCell } from "@/lib/reports/csv";

/**
 * CSV export of a statement: either the live computation (always labelled DRAFT) or an approved or
 * draft snapshot (labelled with its status and hash). Same authorization as the screen (fs_read,
 * organization from the verified session); exports are audited; never cached or public.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const lines: string[][] = [];
  let org: string, actor: string, label: string, entity: string;
  try {
    if (raw.set) {
      if (!z.uuid().safeParse(raw.set).success) return new Response("Not found", { status: 404 });
      const { ctx } = await fsContext();
      org = ctx.organizationId; actor = ctx.actor;
      const s = (await db.execute<{ payload: Record<string, unknown> & { [k: string]: never }; status: string; period_start: string; period_end: string; payload_sha256: string; stale: boolean }>(sql`
        SELECT payload,status,period_start::text,period_end::text,payload_sha256,ledger_fingerprint<>fs_ledger_fingerprint(organization_id,period_end) AS stale
        FROM fs_statement_sets WHERE organization_id=${org} AND id=${raw.set}::uuid`)).rows[0];
      if (!s) return new Response("Not found", { status: 404 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = s.payload as any;
      lines.push([`Calacot statement set ${s.period_start} to ${s.period_end}`], [s.status === "approved" ? "APPROVED statements (immutable snapshot)" : `${s.status.toUpperCase()} statement set — NOT APPROVED`],
        [`Functional currency ${p.functionalCurrency}; snapshot SHA-256 ${s.payload_sha256}${s.stale ? "; the ledger has changed since this snapshot" : ""}`], ["Internal management information, not audited."], []);
      for (const [report, key] of [["income", "incomeStatement"], ["balance", "balanceSheet"], ["cashflow", "cashFlow"], ["equity", "equity"], ["trial", "trialBalance"]] as [ReportType, string][]) {
        lines.push([reportTypes[report]], ["Section", "Code", "Account", "Amount", "Comparative"], ...flattenStatement(report, p[key], key === "trialBalance" ? null : p.comparative?.[key] ?? null), []);
      }
      label = `set-${s.period_start}-to-${s.period_end}-${s.status}`; entity = raw.set;
    } else {
      const d = await readStatementForExport(raw);
      org = d.ctx.organizationId; actor = d.ctx.actor;
      const q = d.query;
      lines.push([`Calacot ${reportTypes[q.report]} ${q.report === "balance" ? `as at ${q.to}` : `${q.from} to ${q.to}`}${q.division ? ` (division ${q.division})` : ""}`],
        [`DRAFT — computed from the posted ledger on ${new Date().toISOString()}. NOT APPROVED.${d.current?.provisional ? " PROVISIONAL." : ""}`],
        [`Functional currency ${d.currency}${q.comparative ? `; comparative ${q.comparative.from} to ${q.comparative.to}` : ""}`], ["Internal management information, not audited."], [],
        ["Section", "Code", "Account", "Amount", q.report === "trial" ? "Credit" : "Comparative"], ...flattenStatement(q.report, d.current, d.comparative));
      label = `${q.report}-${q.from}-to-${q.to}-DRAFT`; entity = `${q.report}:${q.from}:${q.to}`;
    }
  } catch { return new Response("Not found", { status: 404 }); }
  await db.execute(sql`INSERT INTO audit_logs(organization_id,actor_clerk_user_id,actor_type,action,entity_type,entity_id,changes,request_id)
    VALUES(${org},${actor},'staff','fs.export','statement',${entity},${JSON.stringify({ rows: lines.length })}::jsonb,${randomUUID()})`);
  const body = "﻿" + lines.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="calacot-statements-${label}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
