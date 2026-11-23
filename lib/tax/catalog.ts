/**
 * Phase 2D tax vocabulary and the compliance calendar. Labels and pure date logic only: every rule is
 * enforced in drizzle-current/0022_tax_assets_payroll.sql. Due dates come ONLY from approved obligation
 * deadline rules and the approved accounting periods, never from an assumed calendar or incorporation date.
 */

export const taxTypes = ["corporate_income_tax", "vat", "withholding_tax", "paye", "nssf", "other"] as const;
export const taxTypeLabels: Record<string, string> = {
  corporate_income_tax: "Corporate income tax", vat: "VAT", withholding_tax: "Withholding tax", paye: "PAYE", nssf: "NSSF", other: "Other tax or levy",
};
/** Only corporate income tax can be operational in Phase 2D (database CHECK constraint). */
export const operableTaxTypes = new Set(["corporate_income_tax"]);
export const registrationStatuses = ["not_registered", "registered", "applicable", "exempt", "pending_verification", "inactive"] as const;
export const registrationLabels: Record<string, string> = {
  not_registered: "Not registered", registered: "Registered", applicable: "Applicable", exempt: "Exempt", pending_verification: "Pending verification", inactive: "Inactive",
};
export const ruleKinds = ["income_tax_rate", "capital_allowance_class", "paye_bands", "nssf_rates", "vat_rate", "withholding_rate"] as const;
export const ruleKindLabels: Record<string, string> = {
  income_tax_rate: "Income tax rate", capital_allowance_class: "Capital allowance class", paye_bands: "PAYE bands", nssf_rates: "NSSF rates", vat_rate: "VAT rate", withholding_rate: "Withholding tax rate",
};
export const ruleParameterHelp: Record<string, string> = {
  income_tax_rate: '{"rate": "0.3"} and optionally "lossOffsetLimit" (fraction of adjusted profit that losses may offset).',
  capital_allowance_class: '{"classCode": "computers", "method": "straight_line" | "reducing_balance", "rate": "0.4"}',
  paye_bands: '{"bands": [{"upTo": "235000", "rate": "0"}, {"upTo": null, "rate": "0.3"}]} (monthly)',
  nssf_rates: '{"employeeRate": "0.05", "employerRate": "0.1"}',
  vat_rate: '{"rate": "0.18"}',
  withholding_rate: '{"rate": "0.06"}',
};
export const adjustmentKinds = ["non_deductible", "add_back", "other_increase", "deduction", "exempt_income", "other_decrease"] as const;
export const adjustmentLabels: Record<string, string> = {
  non_deductible: "Non-deductible expense (add back)", add_back: "Other add-back", depreciation_addback: "Accounting depreciation added back", other_increase: "Other increase",
  deduction: "Allowable deduction", exempt_income: "Exempt income", capital_allowance: "Capital allowances", other_decrease: "Other decrease",
};
export const creditLabels: Record<string, string> = { withholding_credit: "Withholding tax credit", foreign_tax_credit: "Foreign tax credit", other_credit: "Other credit" };
export const computationKindLabels: Record<string, string> = { provisional: "Provisional estimate", final: "Final computation", amended: "Amended computation" };
export const paymentKindLabels: Record<string, string> = { provisional_instalment: "Provisional instalment", final_balance: "Final balance", assessment: "Assessed amount", penalty: "Penalty", interest: "Interest" };
export const filingKindLabels: Record<string, string> = { provisional_return: "Provisional return", final_return: "Final return", amended_return: "Amended return", other_return: "Other return" };
export const assessmentKindLabels: Record<string, string> = {
  self_assessment: "Self-assessment", original: "Original assessment", additional: "Additional assessment", amended: "Amended assessment", objection_decision: "Objection decision", penalty: "Penalty", interest: "Interest",
};
export const problemLabels: Record<string, string> = {
  tax_rule_not_in_force: "No approved tax rule is in force for the end of the year.",
  tax_obligation_not_operational: "The obligation is not operational.",
  accounting_profit_unavailable: "Accounting profit is not available (enter the estimate for a provisional computation).",
  unposted_journals_in_period: "Journals affecting profit in this year are not posted yet.",
  unposted_source_events_in_period: "Invoices, payments or expenses in this year have not reached the ledger (integration events pending or blocked).",
};

export type DeadlineRule = { event: string; label: string; anchor: "period_end" | "year_start"; monthsOffset: number; day: "last" | number; filing: boolean; payment: boolean };
export type CalendarObligation = { code: string; name: string; tax_type: string; period_basis: string; registration_status: string; processing_enabled: boolean; deadline_rules: DeadlineRule[] };
export type CalendarYear = { fiscal_year: number; start: string; end: string };
export type CalendarEntry = {
  obligation: string; name: string; fiscalYear: number; event: string; label: string; due: string; filing: boolean; payment: boolean;
  filed: boolean; paid: string; status: "done" | "overdue" | "due_soon" | "upcoming"; evidence: string;
};

function addMonths(isoDate: string, months: number, day: "last" | number) {
  const y = +isoDate.slice(0, 4), m = +isoDate.slice(5, 7) - 1 + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = day === "last" ? last : Math.min(day, last);
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

/**
 * Deadlines for accounting-year obligations. An event is "done" when the required filing evidence is
 * recorded (and, for payment-only events, when a payment of the matching kind is recorded). A payment
 * never marks a filing as done.
 */
export function computeCalendar(obligations: CalendarObligation[], years: CalendarYear[], filings: { obligation_code: string; fiscal_year: number; kind: string }[],
  payments: { obligation_code: string; fiscal_year: number; kind: string; amount: string }[], today: string): CalendarEntry[] {
  const soon = addMonths(today, 1, +today.slice(8, 10));
  const out: CalendarEntry[] = [];
  for (const o of obligations) {
    if (o.period_basis !== "accounting_year" || !["registered", "applicable"].includes(o.registration_status)) continue;
    for (const y of years) for (const r of o.deadline_rules) {
      const due = addMonths(r.anchor === "year_start" ? y.start : y.end, r.anchor === "year_start" ? r.monthsOffset : r.monthsOffset, r.day);
      const filingKind = r.event.includes("final") ? "final_return" : r.event.includes("provisional") ? "provisional_return" : null;
      const filed = r.filing ? filings.some((f) => f.obligation_code === o.code && f.fiscal_year === y.fiscal_year && (!filingKind || f.kind === filingKind)) : false;
      const payKind = r.event.includes("final") ? "final_balance" : "provisional_instalment";
      const paid = payments.filter((p) => p.obligation_code === o.code && p.fiscal_year === y.fiscal_year && p.kind === payKind).reduce((s, p) => s + Number(p.amount), 0);
      const done = r.filing ? filed : paid > 0;
      out.push({
        obligation: o.code, name: o.name, fiscalYear: y.fiscal_year, event: r.event, label: r.label, due, filing: r.filing, payment: r.payment, filed, paid: paid.toFixed(2),
        status: done ? "done" : due < today ? "overdue" : due <= soon ? "due_soon" : "upcoming",
        evidence: r.filing ? "Return and URA acknowledgement" : "Payment registration slip (PRN) and bank evidence",
      });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}
