/**
 * Small, dependency-free CSV/TSV reader for the quotation imports. Handles quoted fields, doubled
 * quotes, commas and newlines inside quotes, CRLF, a UTF-8 BOM and tab-separated text pasted from
 * a spreadsheet. Shared by the browser preview and the server import (which re-parses; it never
 * trusts the browser's parse).
 */
export type CsvTable = { headers: string[]; rows: Record<string, string>[] };

export function parseDelimited(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Header names are matched loosely: "Unit price", "unit_price" and "UNIT PRICE" are the same column. */
export const headerKey = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function parseTable(input: string): CsvTable {
  const [head = [], ...body] = parseDelimited(input);
  const headers = head.map(headerKey);
  return {
    headers,
    rows: body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()]))),
  };
}

/** First non-empty value among column aliases. */
export const pick = (row: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (row[k]) return row[k];
  return "";
};

/** "1,250,000.50", "UGX 1 250 000" -> "1250000.50"; "" stays "". */
export const cleanNumber = (v: string) => v.replace(/[^\d.\-]/g, "");

export function toCsv(rows: (string | number)[][]) {
  return rows.map((r) => r.map((c) => {
    const s = String(c);
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  }).join(",")).join("\r\n");
}
