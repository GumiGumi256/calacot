"use client";

import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatNumber } from "@/lib/format";
import type { QueryChanges } from "./use-url-query";
import { pageWindow } from "./preferences";

export function DataTablePagination({
  tableId,
  page,
  size,
  total,
  hrefWith,
  onQuery,
  sizes = [10, 25, 50, 100],
}: {
  tableId: string;
  page: number;
  size: number;
  total: number;
  hrefWith: (changes: QueryChanges) => string;
  onQuery: (changes: QueryChanges) => void;
  sizes?: number[];
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const first = total === 0 ? 0 : (page - 1) * size + 1;
  const last = Math.min(total, page * size);
  const link = (p: number) => hrefWith({ page: p === 1 ? null : p });
  return (
    <div className="flex flex-col-reverse items-center justify-between gap-3 @xl/table:flex-row">
      <p className="type-caption tabular-nums" aria-live="polite">
        Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor={`${tableId}-size`} className="type-caption">Rows</Label>
          <NativeSelect id={`${tableId}-size`} value={String(size)} onChange={(e) => onQuery({ size: e.target.value })} className="h-(--btn-h-sm)">
            {sizes.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </NativeSelect>
        </div>
        {pages > 1 && (
          <nav aria-label="Pagination">
            <ul className="flex items-center gap-1">
              <li>
                <PageButton href={page > 1 ? link(page - 1) : undefined} label="Previous page">
                  <ChevronLeftIcon />
                </PageButton>
              </li>
              {pageWindow(page, pages).map((p, i) =>
                p === "gap" ? (
                  <li key={`gap-${i}`} aria-hidden className="px-1 text-muted-foreground @max-xl/table:hidden">…</li>
                ) : (
                  <li key={p} className={p === page ? "" : "@max-xl/table:hidden"}>
                    <Button
                      size="icon-sm"
                      variant={p === page ? "soft" : "ghost"}
                      nativeButton={false}
                      aria-current={p === page ? "page" : undefined}
                      aria-label={`Page ${p}`}
                      className="tabular-nums"
                      render={<Link href={link(p)} scroll={false} />}
                    >
                      {p}
                    </Button>
                  </li>
                ),
              )}
              <li>
                <PageButton href={page < pages ? link(page + 1) : undefined} label="Next page">
                  <ChevronRightIcon />
                </PageButton>
              </li>
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}

function PageButton({ href, label, children }: { href?: string; label: string; children: React.ReactNode }) {
  if (!href)
    return (
      <Button size="icon-sm" variant="ghost" disabled aria-label={label}>
        {children}
      </Button>
    );
  return (
    <Button size="icon-sm" variant="ghost" nativeButton={false} aria-label={label} render={<Link href={href} scroll={false} />}>
      {children}
    </Button>
  );
}
