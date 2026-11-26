"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, MoreHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { cn } from "@/lib/utils";
import { DataTableToolbar, type StatusChipsConfig } from "./data-table-toolbar";
import { DataTablePagination } from "./data-table-pagination";
import { useColumnPreferences } from "./use-column-preferences";
import { useUrlQuery } from "./use-url-query";
import type { DataColumn, FilterDef, ListQuery, RowAction } from "./types";

/**
 * Calacot Admin DataTable (Design System V1, docs section C7).
 * Server-driven: the page reads the URL, queries the database and passes one page of rows.
 * This component owns presentation only: toolbar, sorting headers, column visibility
 * (persisted per user), row actions, numbered pagination, mobile cards and every state.
 */
export function DataTable<T>({
  tableId,
  label,
  columns,
  rows,
  total,
  query,
  values = {},
  getRowId,
  getRowLabel,
  rowActions,
  statusChips,
  filters,
  searchPlaceholder = "Search…",
  toolbarEnd,
  emptyAction,
  error,
  footer,
  mobileCard,
}: {
  /** Stable id for persisted preferences, e.g. "quotations". */
  tableId: string;
  /** Accessible name of the table, e.g. "Quotations". */
  label: string;
  columns: DataColumn<T>[];
  rows: T[];
  total: number;
  /** The query the server actually used (page already clamped). */
  query: ListQuery;
  /** Current filter values by URL key (status and filters). */
  values?: Record<string, string>;
  getRowId: (row: T) => string;
  /** Names the row in action menus, e.g. the quotation number. */
  getRowLabel: (row: T) => string;
  rowActions?: (row: T) => RowAction[];
  statusChips?: StatusChipsConfig;
  filters?: FilterDef[];
  searchPlaceholder?: string;
  toolbarEnd?: ReactNode;
  /** Create action for the no-records state, only when the user may create. */
  emptyAction?: ReactNode;
  error?: string;
  footer?: ReactNode;
  /** Optional custom phone card. Receives the row and its actions menu; replaces the generic card layout. */
  mobileCard?: (row: T, actions: ReactNode) => ReactNode;
}) {
  const { set, hrefWith, pending } = useUrlQuery();
  const prefs = useColumnPreferences(tableId, columns);
  const visible = columns.filter((c) => c.essential || !prefs.hidden.includes(c.id));
  const filterKeys = [...(statusChips ? [statusChips.key] : []), ...(filters ?? []).map((f) => f.key)];
  const filtered = filterKeys.some((k) => values[k]);

  const sortBy = (c: DataColumn<T>) => {
    if (!c.sortKey) return;
    if (query.sort === c.sortKey) set({ sort: c.sortKey, desc: query.desc ? "false" : "true" });
    else set({ sort: c.sortKey, desc: c.sortDescFirst ? "true" : "false" });
  };
  const ariaSort = (c: DataColumn<T>) =>
    c.sortKey && query.sort === c.sortKey ? (query.desc ? "descending" : "ascending") : c.sortKey ? "none" : undefined;

  const empty = rows.length === 0;
  const emptyState = query.search ? (
    <EmptyState kind="no-results" query={query.search} action={<Button variant="outline" size="sm" onClick={() => set({ search: null })}>Clear search</Button>} />
  ) : filtered ? (
    <EmptyState kind="filtered-out" action={<Button variant="outline" size="sm" onClick={() => set(Object.fromEntries(filterKeys.map((k) => [k, null])))}>Clear filters</Button>} />
  ) : (
    <EmptyState kind="no-records" title={`No ${label.toLowerCase()} yet`} action={emptyAction} />
  );

  const mobile = (role: NonNullable<DataColumn<T>["mobile"]>) => visible.filter((c) => c.mobile === role);

  return (
    <div className="@container/table flex min-w-0 flex-col gap-4" aria-busy={pending}>
      <DataTableToolbar
        tableId={tableId}
        search={query.search}
        searchPlaceholder={searchPlaceholder}
        onQuery={set}
        statusChips={statusChips}
        filters={filters}
        values={values}
        columns={columns}
        hidden={prefs.hidden}
        onToggleColumn={prefs.toggle}
        onResetColumns={prefs.reset}
        columnsCustomised={prefs.isCustomised}
        end={toolbarEnd}
      />

      <div className="relative">
        {pending && (
          <div role="status" aria-label="Updating results" className="absolute inset-x-0 -top-px z-10 h-0.5 overflow-hidden rounded-full bg-primary/20">
            <div className="h-full w-1/3 animate-[table-progress_1s_ease-in-out_infinite] bg-primary motion-reduce:w-full motion-reduce:animate-none" />
          </div>
        )}
        {error ? (
          <div className="surface-card overflow-hidden">
            <ErrorState title={`${label} could not be loaded`} description={error} />
          </div>
        ) : empty ? (
          <div className="surface-card overflow-hidden">{emptyState}</div>
        ) : (
          <div className={cn("transition-opacity motion-reduce:transition-none", pending && "opacity-60")}>
            {/* Wide containers (672px+): table. Layout follows the content width, not the screen, because the sidebar takes up to 256px. */}
            <div className="hidden overflow-hidden surface-card @2xl/table:block">
              <Table aria-label={label} className="[&_td]:align-middle">
                <TableHeader className="bg-surface-subtle [&_tr]:border-b">
                  <TableRow className="hover:bg-transparent">
                    {visible.map((c) => (
                      <TableHead
                        key={c.id}
                        aria-sort={ariaSort(c)}
                        className={cn("h-10 px-3 type-table-head first:pl-4", c.align === "end" && "text-right", c.mobile === "hidden" && "hidden @5xl/table:table-cell", c.className)}
                      >
                        {c.sortKey ? (
                          <button
                            type="button"
                            onClick={() => sortBy(c)}
                            className={cn(
                              "-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                              c.align === "end" && "flex-row-reverse",
                              query.sort === c.sortKey && "text-foreground",
                            )}
                          >
                            {c.label}
                            {query.sort === c.sortKey ? (
                              query.desc ? <ArrowDownIcon aria-hidden className="size-3.5" /> : <ArrowUpIcon aria-hidden className="size-3.5" />
                            ) : (
                              <ArrowUpDownIcon aria-hidden className="size-3.5 opacity-40" />
                            )}
                          </button>
                        ) : (
                          c.label
                        )}
                      </TableHead>
                    ))}
                    {rowActions && <TableHead className="w-12 pr-4"><span className="sr-only">Actions</span></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={getRowId(row)} className="h-13">
                      {visible.map((c) => (
                        <TableCell key={c.id} className={cn("px-3 type-body first:pl-4", c.align === "end" && "text-right tabular-nums", c.mobile === "hidden" && "hidden @5xl/table:table-cell", c.className)}>
                          {c.cell(row)}
                        </TableCell>
                      ))}
                      {rowActions && (
                        <TableCell className="pr-4 text-right">
                          <RowActions actions={rowActions(row)} rowLabel={getRowLabel(row)} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Narrow containers: structured cards built from the same column definitions */}
            <ul aria-label={label} className="flex flex-col gap-3 @2xl/table:hidden">
              {rows.map((row) => (
                mobileCard ? <li key={getRowId(row)} className="surface-card rounded-(--card-radius-sm) p-4">{mobileCard(row, rowActions ? <RowActions actions={rowActions(row)} rowLabel={getRowLabel(row)} /> : null)}</li> :
                <li key={getRowId(row)} className="flex flex-col gap-3 surface-card rounded-(--card-radius-sm) p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      {mobile("title").map((c) => (
                        <div key={c.id} className="type-body-strong [overflow-wrap:anywhere]">{c.cell(row)}</div>
                      ))}
                      {mobile("subtitle").map((c) => (
                        <div key={c.id} className="type-caption [overflow-wrap:anywhere]">{c.cell(row)}</div>
                      ))}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {mobile("status").map((c) => (
                        <div key={c.id}>{c.cell(row)}</div>
                      ))}
                      {rowActions && <RowActions actions={rowActions(row)} rowLabel={getRowLabel(row)} />}
                    </div>
                  </div>
                  {mobile("meta").length > 0 && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {mobile("meta").map((c) => (
                        <div key={c.id} className="flex min-w-0 flex-col gap-0.5">
                          <dt className="type-caption">{c.label}</dt>
                          <dd className={cn("type-body [overflow-wrap:anywhere]", c.align === "end" && "tabular-nums")}>{c.cell(row)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!error && !empty && (
        <DataTablePagination tableId={tableId} page={query.page} size={query.size} total={total} hrefWith={hrefWith} onQuery={set} />
      )}
      {footer && !error && !empty && <div className="type-caption">{footer}</div>}
    </div>
  );
}

function RowActions({ actions, rowLabel }: { actions: RowAction[]; rowLabel: string }) {
  if (!actions.length) return null;
  const safe = actions.filter((a) => !a.destructive);
  const destructive = actions.filter((a) => a.destructive);
  const item = (a: RowAction) =>
    a.href ? (
      <DropdownMenuItem key={a.label} render={a.external ? <a href={a.href} /> : <Link href={a.href} />}>
        {a.icon}
        {a.label}
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem key={a.label} variant={a.destructive ? "destructive" : "default"} onClick={a.onSelect}>
        {a.icon}
        {a.label}
      </DropdownMenuItem>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${rowLabel}`} />}>
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {safe.map(item)}
        {destructive.length > 0 && safe.length > 0 && <DropdownMenuSeparator />}
        {destructive.map(item)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
