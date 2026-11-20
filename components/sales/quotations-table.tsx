"use client";

import Link from "next/link";
import { ExternalLinkIcon, FileTextIcon, PlusIcon, UserRoundIcon } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, FilterDef } from "@/components/data-table/types";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { divisions } from "@/lib/sales/contracts";
import type { ListRow, QueryState } from "@/lib/sales/contracts";
import { statusRegistry } from "@/lib/ui/status";
import { formatDate, formatMoney } from "@/lib/format";

/** Quotation list rows also carry the client id (see listBase in lib/sales/queries.ts). */
export type QuotationRow = ListRow & { client_id?: string };

const quotationStatuses = ["draft", "sent", "accepted", "declined", "expired", "superseded"] as const;
const titleCase = (s: string) => s[0].toUpperCase() + s.slice(1);

/** "Q-2026-014 / R2" -> number and revision, so the revision can be shown quietly. */
function splitNumber(value: string) {
  const [number, revision] = value.split(" / ");
  return { number, revision: revision?.replace(/^R/, "Rev ") };
}

const href = (row: QuotationRow) => `/admin/quotations/${row.id}`;

const columns: DataColumn<QuotationRow>[] = [
  {
    id: "number",
    label: "Number",
    sortKey: "number",
    essential: true,
    mobile: "subtitle",
    cell: (row) => {
      const { number, revision } = splitNumber(row.number);
      return (
        <Link href={href(row)} className="inline-flex flex-col rounded-sm font-medium tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          <span>{number}{revision && <span className="font-normal whitespace-nowrap text-muted-foreground"> · {revision}</span>}</span>
        </Link>
      );
    },
  },
  {
    id: "title",
    label: "Title",
    sortKey: "name",
    mobile: "title",
    className: "min-w-48 max-w-80 whitespace-normal",
    cell: (row) => (
      <Link href={href(row)} className="line-clamp-2 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring max-md:font-semibold">
        {row.name}
      </Link>
    ),
  },
  { id: "client", label: "Client", mobile: "meta", className: "min-w-36 max-w-60 whitespace-normal", cell: (row) => row.client },
  { id: "project", label: "Project", mobile: "hidden", className: "min-w-40 max-w-56 whitespace-normal", cell: (row) => <span className="line-clamp-2">{row.project}</span> },
  { id: "division", label: "Division", defaultHidden: true, mobile: "hidden", cell: (row) => (row.division ? titleCase(row.division) : "—") },
  { id: "status", label: "Status", sortKey: "status", mobile: "status", cell: (row) => <StatusBadge domain="quotation" status={row.status} /> },
  { id: "total", label: "Total", sortKey: "total", sortDescFirst: true, align: "end", mobile: "meta", cell: (row) => formatMoney(row.currency, row.total) },
  {
    id: "valid",
    label: "Valid until",
    sortKey: "due",
    sortDescFirst: true,
    mobile: "meta",
    cell: (row) => <span className={row.status === "expired" ? "text-destructive-text" : undefined}>{formatDate(row.due)}</span>,
  },
  {
    id: "delivery",
    label: "Email delivery",
    defaultHidden: true,
    mobile: "hidden",
    cell: (row) => (row.delivery && row.delivery !== "—" ? <StatusBadge domain="delivery" status={row.delivery} /> : <span className="text-muted-foreground">Not sent</span>),
  },
  { id: "updated", label: "Updated", sortKey: "created", sortDescFirst: true, defaultHidden: true, mobile: "hidden", cell: (row) => formatDate(row.created) },
];

const filters: FilterDef[] = [
  { key: "currency", label: "Currency", type: "select", allLabel: "All currencies", options: [{ value: "UGX", label: "UGX" }, { value: "USD", label: "USD" }] },
  { key: "division", label: "Division", type: "select", allLabel: "All divisions", options: divisions.map((d) => ({ value: d, label: titleCase(d) })) },
  { key: "from", label: "Updated from", type: "date" },
  { key: "to", label: "Updated through", type: "date" },
];

export function QuotationsTable({
  rows,
  total,
  query,
  canCreate,
  summary,
}: {
  rows: QuotationRow[];
  total: number;
  query: QueryState;
  canCreate: boolean;
  summary: { currency: string; total: string }[];
}) {
  return (
    <DataTable
      tableId="quotations"
      label="Quotations"
      columns={columns}
      rows={rows}
      total={total}
      query={query}
      values={{ status: query.status, currency: query.currency, division: query.division, from: query.from, to: query.to }}
      getRowId={(row) => row.id}
      getRowLabel={(row) => `${splitNumber(row.number).number} ${row.name}`}
      searchPlaceholder="Search number, title, client or project"
      statusChips={{
        key: "status",
        label: "Status",
        options: quotationStatuses.map((s) => ({ value: s, label: statusRegistry.quotation[s].label })),
      }}
      filters={filters}
      rowActions={(row) => [
        { label: "Open quotation", href: href(row), icon: <FileTextIcon /> },
        ...(row.client_id ? [{ label: "Open client", href: `/admin/clients/${row.client_id}`, icon: <UserRoundIcon /> }] : []),
        ...(row.status === "draft" ? [] : [{ label: "Download PDF", href: `/api/sales/quotations/${row.id}/pdf`, external: true, icon: <ExternalLinkIcon /> }]),
      ]}
      emptyAction={
        canCreate ? (
          <Button size="sm" nativeButton={false} render={<Link href="/admin/quotations/new" />}>
            <PlusIcon /> New quotation
          </Button>
        ) : undefined
      }
      footer={
        summary.length > 0 && (
          <span className="tabular-nums">
            Matching total: {summary.map((s) => formatMoney(s.currency, s.total)).join(" · ")}
          </span>
        )
      }
    />
  );
}
