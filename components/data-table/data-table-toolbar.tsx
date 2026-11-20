"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Columns3Icon, ListFilterIcon, RotateCcwIcon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DataColumn, FilterDef, FilterOption } from "./types";
import type { QueryChanges } from "./use-url-query";

export type StatusChipsConfig = { key: string; label: string; options: FilterOption[] };

export function DataTableToolbar<T>({
  tableId,
  search,
  searchPlaceholder,
  onQuery,
  statusChips,
  filters = [],
  values,
  columns,
  hidden,
  onToggleColumn,
  onResetColumns,
  columnsCustomised,
  end,
}: {
  tableId: string;
  search: string;
  searchPlaceholder: string;
  onQuery: (changes: QueryChanges) => void;
  statusChips?: StatusChipsConfig;
  filters?: FilterDef[];
  values: Record<string, string>;
  columns: DataColumn<T>[];
  hidden: string[];
  onToggleColumn: (id: string, visible: boolean) => void;
  onResetColumns: () => void;
  columnsCustomised: boolean;
  end?: ReactNode;
}) {
  // Debounced search: typing never loses characters, the URL updates after 350ms.
  const [text, setText] = useState(search);
  const [previous, setPrevious] = useState(search);
  if (previous !== search) {
    setPrevious(search);
    setText(search);
  }
  useEffect(() => {
    if (text === search) return;
    const timer = setTimeout(() => onQuery({ search: text.trim() }), 350);
    return () => clearTimeout(timer);
  }, [text, search, onQuery]);

  // "/" focuses search, matching the documented keyboard convention.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeFilters = filters.filter((f) => values[f.key]);
  const status = statusChips ? values[statusChips.key] ?? "" : "";
  const describe = (f: FilterDef, value: string) =>
    f.type === "date" ? formatDate(value) : f.options.find((o) => o.value === value)?.label ?? value;
  const hideable = columns.filter((c) => !c.essential);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 @4xl/table:flex-row @4xl/table:items-center">
        <div className="relative w-full @4xl/table:max-w-xs">
          <Label htmlFor={`${tableId}-search`} className="sr-only">Search</Label>
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            id={`${tableId}-search`}
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
            aria-keyshortcuts="/"
          />
        </div>
        {statusChips && (
          <div role="group" aria-label={`Filter by ${statusChips.label.toLowerCase()}`} className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 pb-1 @4xl/table:pb-0">
            {[{ value: "", label: "All" }, ...statusChips.options].map((o) => {
              const active = status === o.value;
              return (
                <Button
                  key={o.value || "all"}
                  size="sm"
                  variant={active ? "soft" : "ghost"}
                  aria-pressed={active}
                  className={cn("shrink-0 rounded-full", !active && "text-muted-foreground")}
                  onClick={() => onQuery({ [statusChips.key]: o.value || null })}
                >
                  {o.label}
                </Button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2 @4xl/table:ml-auto">
          {filters.length > 0 && (
            <Popover>
              <PopoverTrigger render={<Button variant="outline" size="sm" />}>
                <ListFilterIcon />
                Filters
                {activeFilters.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[0.6875rem] leading-4 text-primary-foreground tabular-nums">
                    {activeFilters.length}
                  </span>
                )}
              </PopoverTrigger>
              <PopoverContent align="end" className="flex w-72 flex-col gap-3">
                {filters.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`${tableId}-f-${f.key}`}>{f.label}</Label>
                    {f.type === "select" ? (
                      <NativeSelect
                        id={`${tableId}-f-${f.key}`}
                        className="w-full"
                        value={values[f.key] ?? ""}
                        onChange={(e) => onQuery({ [f.key]: e.target.value || null })}
                      >
                        <option value="">{f.allLabel ?? "All"}</option>
                        {f.options.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </NativeSelect>
                    ) : (
                      <Input
                        id={`${tableId}-f-${f.key}`}
                        type="date"
                        value={values[f.key] ?? ""}
                        onChange={(e) => onQuery({ [f.key]: e.target.value || null })}
                      />
                    )}
                  </div>
                ))}
                {activeFilters.length > 0 && (
                  <Button variant="ghost" size="sm" className="self-start" onClick={() => onQuery(Object.fromEntries(filters.map((f) => [f.key, null])))}>
                    Clear filters
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          )}
          {hideable.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                <Columns3Icon />
                <span className="@max-md/table:sr-only">Columns</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                  {hideable.map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={!hidden.includes(c.id)}
                      onCheckedChange={(v) => onToggleColumn(c.id, Boolean(v))}
                      closeOnClick={false}
                    >
                      {c.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!columnsCustomised} onClick={onResetColumns}>
                  <RotateCcwIcon />
                  Reset to default
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {end}
        </div>
      </div>
      {(status || activeFilters.length > 0) && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Applied filters">
          {status && statusChips && (
            <AppliedChip
              label={`${statusChips.label}: ${statusChips.options.find((o) => o.value === status)?.label ?? status}`}
              onRemove={() => onQuery({ [statusChips.key]: null })}
            />
          )}
          {activeFilters.map((f) => (
            <AppliedChip key={f.key} label={`${f.label}: ${describe(f, values[f.key])}`} onRemove={() => onQuery({ [f.key]: null })} />
          ))}
          <Button
            variant="link"
            size="sm"
            className="h-7 px-1"
            onClick={() =>
              onQuery({ ...(statusChips ? { [statusChips.key]: null } : {}), ...Object.fromEntries(filters.map((f) => [f.key, null])) })
            }
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

function AppliedChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full border bg-surface-subtle pr-1 pl-2.5 text-xs">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <XIcon aria-hidden className="size-3" />
      </button>
    </span>
  );
}
