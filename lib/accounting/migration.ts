// Opening-balance staging template (Phase 2F). Parses the fixed CSV template into staging rows. It
// checks shape only; reconciliation, mapping and duplicate checks happen in the database
// (migration_batch_validate). No amount is converted, rounded or balanced here.
import { parseStatementCsv } from "./statement-csv";

export const migrationRowKinds = {
  trial_balance: "Trial balance (signed: debit positive, credit negative)",
  receivable: "Open customer invoice",
  customer_advance: "Customer deposit or advance",
  payable: "Unpaid supplier balance",
  supplier_advance: "Supplier advance",
  bank_balance: "Bank or cash balance per statement or count",
  fixed_asset: "Fixed asset (amount = net book value; cost and accumulated)",
  tax_balance: "Tax liability or prepayment per tax evidence",
} as const;
export type MigrationRowKind = keyof typeof migrationRowKinds;

export const migrationSourceSystems = {
  accounting_software: "Accounting software export",
  spreadsheet: "Spreadsheet records",
  accountant_schedule: "Accountant's opening schedule",
  audited_statements: "Audited or filed financial statements",
  other: "Other documented source",
} as const;

export const migrationTemplateHeader = ["kind", "source_ref", "source_account", "account_code", "counterparty", "document_number", "document_date", "currency", "amount", "cost", "accumulated", "acquired"] as const;

export type MigrationRow = {
  kind: MigrationRowKind; sourceRef: string; sourceAccount?: string; accountCode?: string; counterparty?: string; documentNumber?: string; documentDate?: string;
  currency: string; amount: string; details?: Record<string, string>;
};

const money = /^-?\d{1,15}(\.\d{1,2})?$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Parses the template. Returns rows or the first problems found (row numbers are 1-based, header = 1). */
export function parseMigrationTemplate(bytes: Uint8Array): { rows: MigrationRow[]; errors: string[] } {
  let table: string[][];
  try { table = parseStatementCsv(bytes); } catch (e) { return { rows: [], errors: [e instanceof Error ? e.message.replace("Statement", "The file") : "The file could not be read."] }; }
  const errors: string[] = [];
  if (!table.length) return { rows: [], errors: ["The file is empty."] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = migrationTemplateHeader.filter((h) => !header.includes(h));
  if (missing.length) return { rows: [], errors: [`Missing columns: ${missing.join(", ")}. Use the template.`] };
  const col = (r: string[], name: (typeof migrationTemplateHeader)[number]) => (r[header.indexOf(name)] ?? "").trim();
  const rows: MigrationRow[] = [];
  table.slice(1).forEach((r, i) => {
    if (r.every((c) => !c.trim())) return;
    const n = i + 2;
    const kind = col(r, "kind") as MigrationRowKind;
    const amount = col(r, "amount").replace(/,/g, "");
    if (!(kind in migrationRowKinds)) errors.push(`Row ${n}: unknown kind "${col(r, "kind")}".`);
    if (!col(r, "source_ref")) errors.push(`Row ${n}: source_ref is required (the identifier in the source records).`);
    if (!money.test(amount)) errors.push(`Row ${n}: amount must be a number with at most 2 decimals.`);
    if (kind !== "trial_balance" && amount.startsWith("-")) errors.push(`Row ${n}: schedule amounts are positive outstanding amounts.`);
    if (["trial_balance", "bank_balance", "tax_balance"].includes(kind) && !col(r, "account_code")) errors.push(`Row ${n}: account_code is required for ${kind}.`);
    if (col(r, "document_date") && !isoDate.test(col(r, "document_date"))) errors.push(`Row ${n}: document_date must be YYYY-MM-DD.`);
    const details: Record<string, string> = {};
    if (kind === "fixed_asset") {
      for (const k of ["cost", "accumulated"] as const) { const v = col(r, k).replace(/,/g, ""); if (!money.test(v)) errors.push(`Row ${n}: ${k} is required for a fixed asset.`); else details[k] = v; }
      if (col(r, "acquired")) details.acquired = col(r, "acquired");
    }
    rows.push({ kind, sourceRef: col(r, "source_ref"), sourceAccount: col(r, "source_account") || undefined, accountCode: col(r, "account_code") || undefined, counterparty: col(r, "counterparty") || undefined,
      documentNumber: col(r, "document_number") || undefined, documentDate: col(r, "document_date") || undefined, currency: col(r, "currency").toUpperCase(), amount, details });
  });
  return { rows, errors: errors.slice(0, 20) };
}
