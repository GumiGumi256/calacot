/** Untrusted statement parsing. This module does not persist data or create journals. */
export const STATEMENT_MAX_BYTES = 2 * 1024 * 1024;
export const STATEMENT_MAX_ROWS = 10000;
const MAX_FIELD = 2000;

export type StatementColumn = "date" | "description" | "debit" | "credit" | "amount" | "reference" | "currency" | "balance";
export type StatementMapping = Partial<Record<StatementColumn, number>>;
export type StatementRow = { date: string; description: string; amountMinor: bigint; reference: string; currency: string; balanceMinor: bigint | null; sourceRow: number };

/** A bounded RFC-4180-style CSV reader, including quoted commas and newlines. */
export function parseStatementCsv(bytes: Uint8Array): string[][] {
  if (bytes.byteLength > STATEMENT_MAX_BYTES) throw new Error("Statement exceeds the 2 MB limit.");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); }
  catch { throw new Error("Statement must be UTF-8 encoded."); }
  if (text.includes("\0")) throw new Error("Statement contains an invalid character.");
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false; let closed = false;
  const addField = () => { row.push(field); field = ""; closed = false; if (row.length > 100) throw new Error("Too many columns."); };
  const addRow = () => { addField(); if (row.some((v) => v.trim())) rows.push(row); row = []; if (rows.length > STATEMENT_MAX_ROWS + 1) throw new Error("Too many statement rows."); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (c === ",") addField();
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; addRow(); }
    else if (closed || c === '"') throw new Error("Malformed CSV quoting.");
    else field += c;
    if (field.length > MAX_FIELD) throw new Error("A statement field is too long.");
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  if (field || row.length || closed) addRow();
  if (rows.length < 2) throw new Error("A header and at least one transaction are required.");
  if (rows.some((r) => r.length !== rows[0].length)) throw new Error("Statement rows have inconsistent column counts.");
  return rows;
}

function minor(value: string): bigint {
  const s = value.trim();
  if (!/^-?\d{1,15}(?:\.\d{1,2})?$/.test(s)) throw new Error("Invalid amount; use a decimal number without grouping separators.");
  const negative = s.startsWith("-"); const [whole, fraction = ""] = (negative ? s.slice(1) : s).split(".");
  const n = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return negative ? -n : n;
}

/** Dates are deliberately ISO-only: ambiguous locale dates must be converted before import. */
export function mapStatementRows(rows: string[][], mapping: StatementMapping, accountCurrency: string): StatementRow[] {
  if (!/^[A-Z]{3}$/.test(accountCurrency)) throw new Error("Invalid account currency.");
  const indexes = Object.values(mapping);
  if (indexes.some((i) => !Number.isInteger(i) || i < 0 || i >= rows[0].length) || new Set(indexes).size !== indexes.length) throw new Error("Invalid or repeated column mapping.");
  if (mapping.date === undefined || mapping.description === undefined || (mapping.amount === undefined && (mapping.debit === undefined || mapping.credit === undefined)) || (mapping.amount !== undefined && (mapping.debit !== undefined || mapping.credit !== undefined))) throw new Error("Map date, description and either amount or both debit and credit.");
  const get = (row: string[], key: StatementColumn) => mapping[key] === undefined ? "" : row[mapping[key]!].trim();
  return rows.slice(1).map((row, index) => {
    try {
      const date = get(row, "date");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Invalid ISO date.");
      const description = get(row, "description"); if (!description) throw new Error("Description is required.");
      let amountMinor: bigint;
      if (mapping.amount !== undefined) amountMinor = minor(get(row, "amount"));
      else { const debit = get(row, "debit") ? minor(get(row, "debit")) : BigInt(0); const credit = get(row, "credit") ? minor(get(row, "credit")) : BigInt(0); if (debit < BigInt(0) || credit < BigInt(0) || (debit > BigInt(0) && credit > BigInt(0))) throw new Error("Debit and credit must be nonnegative and only one may be populated."); amountMinor = credit - debit; }
      if (amountMinor === BigInt(0)) throw new Error("Transaction amount must be nonzero.");
      const currency = (get(row, "currency") || accountCurrency).toUpperCase(); if (currency !== accountCurrency) throw new Error("Transaction currency differs from account currency.");
      const balance = get(row, "balance");
      return { date, description, amountMinor, reference: get(row, "reference"), currency, balanceMinor: balance ? minor(balance) : null, sourceRow: index + 2 };
    } catch (error) { throw new Error(`Row ${index + 2}: ${error instanceof Error ? error.message : "Invalid row."}`); }
  });
}

/** For spreadsheet exports only; keep the original text unchanged in immutable source records. */
export function spreadsheetSafeCell(value: string): string {
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value;
}

/** Suggests a column mapping from common bank and mobile-money header names. The user confirms it. */
export function guessMapping(header: string[]): StatementMapping {
  const names: [StatementColumn, RegExp][] = [
    ["date", /^(transaction |txn |value |posting |book(ing)? )?date$/i], ["description", /^(description|narration|narrative|details|particulars|memo|transaction details)$/i],
    ["debit", /^(debit|debits|withdrawal|withdrawals|money out|paid out|dr)( amount)?$/i], ["credit", /^(credit|credits|deposit|deposits|money in|paid in|cr)( amount)?$/i],
    ["amount", /^(amount|transaction amount|value)$/i], ["reference", /^(reference|ref|ref no|reference number|transaction id|cheque no|receipt no)\.?$/i],
    ["currency", /^(currency|ccy)$/i], ["balance", /^(balance|running balance|closing balance|ledger balance)$/i],
  ];
  const mapping: StatementMapping = {};
  header.forEach((h, i) => {
    const hit = names.find(([key, re]) => mapping[key] === undefined && re.test(h.trim()));
    if (hit) mapping[hit[0]] = i;
  });
  if (mapping.amount !== undefined && (mapping.debit !== undefined || mapping.credit !== undefined)) delete mapping.amount;
  return mapping;
}

/**
 * Statement format registry: the documented extension point for other bank statement formats
 * (OFX, CAMT.053, MT940, provider exports). A format turns the uploaded bytes into a header row and
 * data rows of untrusted text; mapStatementRows() then applies the same validation to every format.
 * Add a format here, add its name to bank_statement_imports.source_format (CHECK constraint) in a
 * reviewed migration, and allow its extension in app/api/banking/statements/route.ts.
 */
export type StatementFormat = { label: string; extensions: string[]; parse: (bytes: Uint8Array) => string[][] };
export const statementFormats: Record<"csv", StatementFormat> = {
  csv: { label: "CSV (comma-separated, UTF-8)", extensions: [".csv"], parse: parseStatementCsv },
};
