import type { ReactNode } from "react";

/**
 * Calacot DataTable column definition (docs section C7).
 * One definition drives the desktop table, the mobile card list and the column menu.
 * Sorting, filtering and pagination are server-side (URL parameters); columns only
 * declare which server sort key they map to.
 */
export type DataColumn<T> = {
  id: string;
  /** Header text, and the name shown in the column menu. */
  label: string;
  cell: (row: T) => ReactNode;
  /** Server sort key (the URL `sort` value). Omit for unsortable columns. */
  sortKey?: string;
  /** Start descending on first click (dates and amounts). */
  sortDescFirst?: boolean;
  align?: "start" | "end";
  /** Identification columns users cannot hide. */
  essential?: boolean;
  /** Hidden until the user turns it on. */
  defaultHidden?: boolean;
  /**
   * Role in the mobile card: title (first line, usually the link), subtitle (second line),
   * status (top-right badge), meta (label/value grid) or hidden. "hidden" columns are also
   * dropped while the table container is under 1024px wide, so it fits without sideways scrolling.
   */
  mobile?: "title" | "subtitle" | "status" | "meta" | "hidden";
  className?: string;
};

export type RowAction = {
  label: string;
  href?: string;
  /** Plain <a> (downloads, API routes) instead of client navigation. */
  external?: boolean;
  onSelect?: () => void;
  icon?: ReactNode;
  destructive?: boolean;
};

export type FilterOption = { value: string; label: string };

export type FilterDef =
  | { key: string; label: string; type: "select"; options: FilterOption[]; allLabel?: string }
  | { key: string; label: string; type: "date" };

export type ListQuery = {
  search: string;
  page: number;
  size: number;
  sort: string;
  desc: boolean;
};
