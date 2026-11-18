import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { paymentInstructions } from "@/lib/company";
import { divisionKeys, type CompanySettings } from "./settings-schema";

type VersionRow = { id: string; version: number; settings: CompanySettings; changed_sections: string[]; status: string; note: string; proposed_by: string; proposed_at: string; decided_by: string | null; decided_at: string | null; decision_note: string | null; base_version: number };

/** Settings as they are today when nothing has been saved: organization record + deployment payment config. */
export async function baselineSettings(org: string): Promise<CompanySettings> {
  const o = (await db.execute<{ legal_name: string; name: string; tax_identifier: string | null; email: string | null; phone: string | null; billing_address: string | null }>(sql`SELECT legal_name,name,tax_identifier,email,phone,billing_address FROM organizations WHERE id=${org}`)).rows[0];
  const env = paymentInstructions();
  return {
    identity: { legalName: o?.legal_name ?? "", tradingName: o && o.name !== o.legal_name ? o.name : "", taxIdentifier: o?.tax_identifier ?? "" },
    contacts: { email: o?.email ?? "", phone: o?.phone ?? "" },
    address: { line1: o?.billing_address ?? "", city: "", country: "" },
    divisions: divisionKeys.map((key) => ({ key, label: key[0].toUpperCase() + key.slice(1), enabled: true })),
    payment: { bank: env.bank ? { ...env.bank, currency: env.bank.currency as "UGX" | "USD" } : null, mobile: env.mobile ? { ...env.mobile, currency: env.mobile.currency as "UGX" | "USD" } : null },
    defaults: { defaultCurrency: "UGX" },
  };
}

export async function readCompanySettings(org: string) {
  const [current, proposal, history] = await Promise.all([
    db.execute<VersionRow>(sql`SELECT * FROM company_settings_versions WHERE organization_id=${org} AND status='approved' ORDER BY version DESC LIMIT 1`),
    db.execute<VersionRow>(sql`SELECT * FROM company_settings_versions WHERE organization_id=${org} AND status='proposed' LIMIT 1`),
    db.execute<VersionRow>(sql`SELECT id,version,changed_sections,status,note,proposed_by,proposed_at::text AS proposed_at,decided_by,decided_at::text AS decided_at,decision_note FROM company_settings_versions WHERE organization_id=${org} ORDER BY version DESC LIMIT 20`),
  ]);
  const cur = current.rows[0];
  return { version: cur?.version ?? 0, settings: cur?.settings ?? (await baselineSettings(org)), saved: !!cur, proposal: proposal.rows[0] ?? null, history: history.rows };
}

/** Effective settings for consumers; null when nothing has been saved yet. */
export async function effectiveSettings(org: string) {
  const r = await db.execute<{ settings: CompanySettings }>(sql`SELECT settings FROM company_settings_versions WHERE organization_id=${org} AND status='approved' ORDER BY version DESC LIMIT 1`);
  return r.rows[0]?.settings ?? null;
}
