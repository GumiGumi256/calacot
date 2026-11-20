// CSV encoding for report exports. Spreadsheet formula injection is neutralized: any text
// cell beginning with = + - @ tab or carriage return (after optional whitespace) is prefixed
// with an apostrophe so spreadsheet software treats it as text. Plain numbers are kept as
// numbers. Every field is quoted; a UTF-8 BOM keeps Excel from mangling names.
const NUMBER = /^-?\d+(\.\d+)?$/;
const DANGEROUS = /^[\s]*[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let s = typeof value === "number" ? String(value) : String(value);
  if (!(typeof value === "number" || NUMBER.test(s)) && DANGEROUS.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[], preamble: string[] = []) {
  const lines = [
    ...preamble.map((p) => csvCell(p)),
    columns.map((c) => csvCell(c.label)).join(","),
    ...rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(",")),
  ];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
