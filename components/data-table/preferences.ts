/** Pure column-preference helpers (no React, no Clerk) so scripts can verify them. */

type ColumnFlags = { id: string; essential?: boolean; defaultHidden?: boolean };

export function preferenceKey(tableId: string, orgId: string | null | undefined, userId: string) {
  return `calacot.table.${tableId}.v1.${orgId ?? "personal"}.${userId}`;
}

/** Stored hidden ids minus essential or unknown columns; defaults when nothing valid is stored. */
export function resolveHidden(raw: string | null, columns: ColumnFlags[]) {
  const hideable = new Set(columns.filter((c) => !c.essential).map((c) => c.id));
  const defaults = columns.filter((c) => c.defaultHidden && !c.essential).map((c) => c.id);
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as { hidden?: unknown };
    if (!Array.isArray(parsed.hidden)) return defaults;
    return parsed.hidden.filter((id): id is string => typeof id === "string" && hideable.has(id));
  } catch {
    return defaults;
  }
}

/** Page numbers with ellipses: 1 … 4 5 6 … 20. */
export function pageWindow(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}
