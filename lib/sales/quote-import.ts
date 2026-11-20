import { currencies, divisions } from "./contracts";
import { totals } from "./money";
import { cleanNumber, parseTable, pick } from "./csv";

/*
 * Quotation import (CSV). One row per line item; rows sharing a quote reference form one
 * quotation. Pure parsing and validation, shared by the browser preview and the server import.
 * The server always re-parses the uploaded text and never trusts the browser's result.
 */

export const IMPORT_LIMITS = { bytes: 1_000_000, rows: 2_000, quotations: 200, linesPerQuote: 100 } as const;
export const DEFAULT_TERMS = "Standard Calacot terms apply. Prices include tax where shown.";

export const importColumns = [
  { key: "quote_ref", required: true, note: "Groups rows into one quotation, e.g. your old quote number." },
  { key: "client_name", required: true, note: "Matched to an existing client by email, phone or name; otherwise created." },
  { key: "client_email", required: true, note: "Where the quotation is sent; becomes the client's contact." },
  { key: "client_phone", required: false, note: "International format, e.g. +256700000000." },
  { key: "client_type", required: false, note: "individual (default) or company." },
  { key: "title", required: false, note: "Defaults to “Quotation <quote_ref>”." },
  { key: "division", required: true, note: divisions.join(", ") },
  { key: "currency", required: false, note: "UGX (default) or USD." },
  { key: "scope", required: false, note: "Defaults to the title." },
  { key: "terms", required: false, note: "Defaults to standard Calacot terms." },
  { key: "valid_until", required: false, note: "YYYY-MM-DD or DD/MM/YYYY. Past or missing dates become 30 days from today." },
  { key: "description", required: true, note: "The line item." },
  { key: "quantity", required: false, note: "Defaults to 1." },
  { key: "unit", required: false, note: "Defaults to item." },
  { key: "unit_price", required: true, note: "Numbers only; separators are ignored." },
  { key: "discount", required: false, note: "Amount off the line; defaults to 0." },
] as const;

export type ImportLine = { description: string; unit: string; quantity: string; unitPrice: string; discountAmount: string; taxRate: string };
export type ImportQuote = {
  ref: string;
  rows: number[];
  client: { name: string; email: string; phone: string; kind: "individual" | "company" };
  title: string;
  division: (typeof divisions)[number];
  currency: (typeof currencies)[number];
  scope: string;
  terms: string;
  validUntil: string; // ISO datetime, end of day UTC
  validityAdjusted: boolean;
  items: ImportLine[];
  total: string;
  problems: string[]; // blocking: the quotation is not imported
};
export type ImportParse = { quotes: ImportQuote[]; fileErrors: string[] };

const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const money = /^\d{1,15}(\.\d{1,2})?$/;

/** "2026-12-31", "31/12/2026" or "1/2/2027" -> ISO end-of-day UTC, or null. */
function parseDate(v: string) {
  let y: number, m: number, d: number;
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function parseQuotationImport(text: string, taxRate: string, now = new Date()): ImportParse {
  const fileErrors: string[] = [];
  if (text.length > IMPORT_LIMITS.bytes) return { quotes: [], fileErrors: ["The file is larger than 1 MB. Split it into smaller files."] };
  const table = parseTable(text);
  const missing = ["quote_ref", "client_name", "client_email", "division", "description", "unit_price"].filter(
    (k) => !table.headers.includes(k) && !(k === "quote_ref" && table.headers.some((h) => ["quote_number", "reference", "ref", "quote_no"].includes(h))),
  );
  if (!table.rows.length) return { quotes: [], fileErrors: ["No rows found. The first row must name the columns."] };
  if (missing.length) return { quotes: [], fileErrors: [`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template to see the expected columns.`] };
  if (table.rows.length > IMPORT_LIMITS.rows) return { quotes: [], fileErrors: [`At most ${IMPORT_LIMITS.rows} rows per file.`] };

  const groups = new Map<string, { row: Record<string, string>; n: number }[]>();
  table.rows.forEach((row, i) => {
    const ref = pick(row, "quote_ref", "quote_number", "reference", "ref", "quote_no");
    if (!ref) return void fileErrors.push(`Row ${i + 2}: no quote reference; skipped.`);
    groups.set(ref, [...(groups.get(ref) ?? []), { row, n: i + 2 }]);
  });
  if (groups.size > IMPORT_LIMITS.quotations) return { quotes: [], fileErrors: [`At most ${IMPORT_LIMITS.quotations} quotations per file.`] };

  const fallbackValidity = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 30, 23, 59, 59));
  const quotes = [...groups.entries()].map(([ref, entries]) => {
    const head = entries[0].row;
    const problems: string[] = [];
    const division = pick(head, "division").toLowerCase() as ImportQuote["division"];
    if (!divisions.includes(division)) problems.push(`Division "${pick(head, "division") || "(empty)"}" must be one of ${divisions.join(", ")}.`);
    const currency = (pick(head, "currency").toUpperCase() || "UGX") as ImportQuote["currency"];
    if (!currencies.includes(currency)) problems.push(`Currency "${currency}" must be UGX or USD.`);
    const client = {
      name: pick(head, "client_name", "client").slice(0, 200),
      email: pick(head, "client_email", "email").toLowerCase(),
      phone: pick(head, "client_phone", "phone"),
      kind: (pick(head, "client_type").toLowerCase() === "company" ? "company" : "individual") as ImportQuote["client"]["kind"],
    };
    if (!client.name) problems.push("Client name is missing.");
    if (!email.test(client.email)) problems.push(`Client email "${client.email || "(empty)"}" isn't a valid email; quotations are sent by email.`);
    const title = (pick(head, "title") || `Quotation ${ref}`).slice(0, 200);
    const given = pick(head, "valid_until", "validity", "expiry", "expires");
    const parsed = given ? parseDate(given) : null;
    if (given && !parsed) problems.push(`Valid-until date "${given}" isn't a date (use YYYY-MM-DD or DD/MM/YYYY).`);
    const validityAdjusted = !parsed || parsed <= now;

    const items: ImportLine[] = [];
    for (const { row, n } of entries) {
      const description = pick(row, "description", "item_description", "item");
      const quantity = cleanNumber(pick(row, "quantity", "qty")) || "1";
      const unitPrice = cleanNumber(pick(row, "unit_price", "price", "rate"));
      const discountAmount = cleanNumber(pick(row, "discount", "discount_amount")) || "0";
      if (!description) { problems.push(`Row ${n}: line description is missing.`); continue; }
      if (!/^\d{1,10}(\.\d{1,4})?$/.test(quantity) || Number(quantity) <= 0) { problems.push(`Row ${n}: quantity "${quantity}" isn't a positive number.`); continue; }
      if (!money.test(unitPrice)) { problems.push(`Row ${n}: unit price "${pick(row, "unit_price", "price", "rate") || "(empty)"}" isn't a valid amount.`); continue; }
      if (!money.test(discountAmount)) { problems.push(`Row ${n}: discount "${discountAmount}" isn't a valid amount.`); continue; }
      items.push({ description: description.slice(0, 2000), unit: (pick(row, "unit", "uom") || "item").slice(0, 40), quantity, unitPrice, discountAmount, taxRate });
    }
    if (items.length > IMPORT_LIMITS.linesPerQuote) problems.push(`More than ${IMPORT_LIMITS.linesPerQuote} lines.`);
    let total = "";
    if (items.length && !problems.length) {
      try { total = totals(items, taxRate).total; } catch (e) { problems.push(e instanceof Error ? e.message : "Totals could not be calculated."); }
    }
    return {
      ref, rows: entries.map((e) => e.n), client, title,
      division, currency,
      scope: (pick(head, "scope") || title).slice(0, 10000),
      terms: (pick(head, "terms") || DEFAULT_TERMS).slice(0, 10000),
      validUntil: (validityAdjusted ? fallbackValidity : parsed!).toISOString(),
      validityAdjusted: validityAdjusted && !problems.some((p) => p.startsWith("Valid-until")),
      items, total, problems,
    } satisfies ImportQuote;
  });
  return { quotes, fileErrors };
}

export const templateCsv = [
  importColumns.map((c) => c.key).join(","),
  "Q-2026-014,Jane Namuli,jane@example.com,+256700000001,individual,Living room repaint,painting,UGX,Repaint living and dining rooms,,2026-12-31,Wall preparation and sanding,120,m²,4500,0",
  "Q-2026-014,Jane Namuli,jane@example.com,+256700000001,individual,Living room repaint,painting,UGX,Repaint living and dining rooms,,2026-12-31,Two coats of emulsion,120,m²,9000,50000",
  "Q-2026-015,Acacia Holdings Ltd,accounts@example.com,,company,Office fit-out drawings,architecture,USD,,,,Concept design package,1,package,2500,0",
].join("\r\n");
