"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  useTable,
  FlexRender,
  type ColumnDef,
  type RowData,
  type ColumnVisibilityState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { features, type DataTableFeatures } from "./table-features";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import type { QueryState } from "@/lib/sales/contracts";
export type FilterConfig = {
  key: keyof QueryState;
  label: string;
  values: { value: string; label: string }[];
};
export function DataTable<TData extends RowData, TValue>({
  columns,
  rows,
  total,
  query,
  onQuery,
  filters = [],
  toolbar,
  bulkAction,
  selection = false,
  loading = false,
  error,
  getRowId,
}: {
  columns: ColumnDef<DataTableFeatures, TData, TValue>[];
  rows: TData[];
  total: number;
  query: QueryState;
  onQuery: (next: QueryState) => void;
  filters?: FilterConfig[];
  toolbar?: ReactNode;
  bulkAction?: (ids: string[]) => ReactNode;
  selection?: boolean;
  loading?: boolean;
  error?: string;
  getRowId: (row: TData) => string;
}) {
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  const [selected, setSelected] = useState<RowSelectionState>({});
  const [search, setSearch] = useState(query.search);
  const [previousSearch, setPreviousSearch] = useState(query.search);
  if (previousSearch !== query.search) {
    setPreviousSearch(query.search);
    setSearch(query.search);
  }
  // The owner handles URL navigation; no client data fetch can overwrite newer server props.
  useEffect(() => {
    if (search === query.search) return;
    const timer = setTimeout(() => onQuery({ ...query, search, page: 1 }), 350);
    return () => clearTimeout(timer);
  }, [search, query, onQuery]);
  const table = useTable({
    features,
    data: rows,
    columns: columns as unknown as ColumnDef<
      DataTableFeatures,
      TData,
      unknown
    >[],
    getRowId,
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    enableRowSelection: selection,
    state: {
      pagination: { pageIndex: query.page - 1, pageSize: query.size },
      sorting: [{ id: query.sort, desc: query.desc }],
      columnVisibility: visibility,
      rowSelection: selected,
    },
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setSelected,
    onSortingChange: (updater) => {
      const current = [{ id: query.sort, desc: query.desc }];
      const next = typeof updater === "function" ? updater(current) : updater;
      onQuery({
        ...query,
        sort: next[0]?.id || "created",
        desc: next[0]?.desc ?? true,
        page: 1,
      });
    },
    onPaginationChange: (updater) => {
      const current = { pageIndex: query.page - 1, pageSize: query.size };
      const next = typeof updater === "function" ? updater(current) : updater;
      onQuery({ ...query, page: next.pageIndex + 1, size: next.pageSize });
    },
  });
  return (
    <div className="flex flex-col gap-4" aria-busy={loading}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="table-search">Search</Label>
          <Input
            id="table-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search records…"
          />
        </div>
        {filters.map((f) => (
          <div key={f.key} className="flex flex-col gap-2">
            <Label htmlFor={`filter-${f.key}`}>{f.label}</Label>
            <Select
              value={String(query[f.key]) || "all"}
              onValueChange={(v) =>
                onQuery({ ...query, [f.key]: v === "all" ? "" : v, page: 1 })
              }
            >
              <SelectTrigger id={`filter-${f.key}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All</SelectItem>
                  {f.values.map((v) => (
                    <SelectItem value={v.value} key={v.value}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            Columns
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              {table
                .getAllColumns()
                .filter((c) => c.getCanHide())
                .map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={c.getIsVisible()}
                    onCheckedChange={(v) => c.toggleVisibility(!!v)}
                  >
                    {c.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {toolbar}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((g) => (
              <TableRow key={g.id}>
                {selection&&<TableHead><Checkbox aria-label="Select rows on this page" checked={table.getIsAllPageRowsSelected()} onCheckedChange={v=>table.toggleAllPageRowsSelected(!!v)}/></TableHead>}
                {g.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    aria-sort={
                      h.column.getIsSorted() === "asc"
                        ? "ascending"
                        : h.column.getIsSorted() === "desc"
                          ? "descending"
                          : "none"
                    }
                  >
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        <FlexRender header={h} />
                        {h.column.getIsSorted() === "desc"
                          ? " ↓"
                          : h.column.getIsSorted() === "asc"
                            ? " ↑"
                            : ""}
                      </Button>
                    ) : (
                      <FlexRender header={h} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((r) => (
              <TableRow
                key={r.id}
                data-state={r.getIsSelected() ? "selected" : undefined}
              >
                {selection&&<TableCell><Checkbox aria-label={`Select row ${r.id}`} checked={r.getIsSelected()} onCheckedChange={v=>r.toggleSelected(!!v)}/></TableCell>}
                {r.getVisibleCells().map((c) => (
                  <TableCell key={c.id}>
                    <FlexRender cell={c} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!rows.length && !loading && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {query.search || query.status || query.currency
                ? "No matching results"
                : "No records yet"}
            </EmptyTitle>
            <EmptyDescription>
              {query.search || query.status
                ? "Change your search or filters."
                : "Create a record to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {selection &&
        bulkAction?.(Object.keys(selected).filter((id) => selected[id]))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          {total} records · Page {query.page} of{" "}
          {Math.max(1, Math.ceil(total / query.size))}
        </span>
        <div className="flex items-center gap-2">
          <Label htmlFor="page-size">Rows</Label>
          <Select
            value={String(query.size)}
            onValueChange={(v) =>
              onQuery({ ...query, size: Number(v), page: 1 })
            }
          >
            <SelectTrigger id="page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={loading || query.page <= 1}
            onClick={() => onQuery({ ...query, page: query.page - 1 })}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={loading || query.page * query.size >= total}
            onClick={() => onQuery({ ...query, page: query.page + 1 })}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
