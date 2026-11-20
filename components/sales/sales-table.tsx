"use client";

import Link from "next/link";
import { ExternalLinkIcon, FileTextIcon, FolderKanbanIcon, MailIcon, UserRoundIcon } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, FilterDef, RowAction } from "@/components/data-table/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { divisions } from "@/lib/sales/contracts";
import type { ListRow, QueryState } from "@/lib/sales/contracts";
import { statusRegistry } from "@/lib/ui/status";
import { formatDate, formatMoney } from "@/lib/format";

/*
 * Clients, projects, invoices and delivery operations on the Design System V1 table (Phase 6).
 * Same rows, permissions and URL parameters as before; only the presentation moved.
 */
export type SalesTableEntity = "clients" | "projects" | "invoices" | "deliveries";
type Row = ListRow & { client_id?: string; division?: string; activeProjects?: number };

const titleCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).replaceAll("_", " ") : "—");
const dash = (s: string | undefined) => (s && s !== "—" ? s : <span className="text-muted-foreground">—</span>);
/** "invoice whatsapp" (entity type and channel from the deliveries query) -> "Invoice by WhatsApp". */
const channels: Record<string, string> = { email: "email", whatsapp: "WhatsApp" };
const messageName = (name: string) => {
  const [type, channel] = name.split(" ");
  return `${titleCase(type)}${channel ? ` by ${channels[channel] ?? channel}` : ""}`;
};
const href = (entity: SalesTableEntity, row: Row) => `/admin/${entity}/${row.id}`;
/** A cell renderer linking the row's name (or number) to its detail page. */
function link(entity: SalesTableEntity, text: "name" | "number") {
  return function RecordLink(row: Row) {
    return (
      <Link href={href(entity, row)} className="line-clamp-2 rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
        {text === "name" ? row.name : row.number || row.name}
      </Link>
    );
  };
}
/** "UGX 1,000.00, USD 20.00" from the clients query -> formatted money per currency. */
const balances = (value: string) =>
  !value || value === "—" ? <span className="text-muted-foreground">None</span> : value.split(", ").map((part) => {
    const [currency, amount] = part.split(" ");
    return <span key={currency} className="block tabular-nums">{formatMoney(currency, amount)}</span>;
  });

const updated = (sortable = true): DataColumn<Row> => ({
  id: "updated", label: "Updated", sortKey: sortable ? "created" : undefined, sortDescFirst: true, mobile: "meta", cell: (r) => formatDate(r.created),
});

const columns: Record<SalesTableEntity, DataColumn<Row>[]> = {
  clients: [
    { id: "name", label: "Client", sortKey: "name", essential: true, mobile: "title", className: "min-w-44 max-w-72 whitespace-normal", cell: link("clients", "name") },
    { id: "kind", label: "Type", mobile: "subtitle", cell: (r) => titleCase(r.kind) },
    { id: "email", label: "Primary email", mobile: "meta", className: "max-w-56 truncate", cell: (r) => dash(r.email) },
    { id: "phone", label: "Phone", mobile: "hidden", cell: (r) => dash(r.phone) },
    { id: "active", label: "Active projects", align: "end", mobile: "meta", cell: (r) => <span className="tabular-nums">{r.activeProjects ?? 0}</span> },
    { id: "balance", label: "Outstanding", align: "end", mobile: "meta", cell: (r) => balances(r.balance) },
    { id: "status", label: "Status", sortKey: "status", mobile: "status", cell: (r) => <StatusBadge domain="client" status={r.status} /> },
    { ...updated(), defaultHidden: true, mobile: "hidden" },
  ],
  projects: [
    { id: "name", label: "Project", sortKey: "name", essential: true, mobile: "title", className: "min-w-48 max-w-80 whitespace-normal", cell: link("projects", "name") },
    { id: "code", label: "Code", sortKey: "number", mobile: "subtitle", cell: (r) => <span className="tabular-nums">{dash(r.number)}</span> },
    { id: "client", label: "Client", mobile: "meta", className: "min-w-36 max-w-60 whitespace-normal", cell: (r) => r.client },
    { id: "division", label: "Division", mobile: "meta", cell: (r) => titleCase(r.division ?? "") },
    { id: "status", label: "Status", sortKey: "status", mobile: "status", cell: (r) => <StatusBadge domain="project" status={r.status} /> },
    { id: "budget", label: "Budget", sortKey: "total", sortDescFirst: true, align: "end", defaultHidden: true, mobile: "hidden", cell: (r) => (Number(r.total) ? formatMoney(r.currency, r.total) : dash("")) },
    { id: "due", label: "Due", sortKey: "due", mobile: "meta", cell: (r) => (r.due ? formatDate(r.due) : dash("")) },
    { ...updated(), defaultHidden: true, mobile: "hidden" },
  ],
  invoices: [
    { id: "number", label: "Number", sortKey: "number", essential: true, mobile: "title", cell: (r) => <span className="tabular-nums">{link("invoices", "number")(r)}</span> },
    { id: "client", label: "Client", mobile: "subtitle", className: "min-w-36 max-w-60 whitespace-normal", cell: (r) => r.client },
    { id: "project", label: "Project", mobile: "hidden", className: "min-w-40 max-w-56 whitespace-normal", cell: (r) => <span className="line-clamp-2">{r.project}</span> },
    { id: "status", label: "Status", sortKey: "status", mobile: "status", cell: (r) => <StatusBadge domain="invoice" status={r.status} /> },
    { id: "payment", label: "Payment", mobile: "meta", cell: (r) => (r.payment === "not_issued" ? dash("") : <StatusBadge domain="invoicePayment" status={r.payment} />) },
    { id: "total", label: "Total", sortKey: "total", sortDescFirst: true, align: "end", mobile: "meta", cell: (r) => formatMoney(r.currency, r.total) },
    { id: "due-amount", label: "Amount due", align: "end", mobile: "meta", cell: (r) => <span className={r.payment === "overdue" ? "text-destructive-text" : undefined}>{formatMoney(r.currency, r.balance)}</span> },
    { id: "due", label: "Due date", sortKey: "due", mobile: "meta", cell: (r) => (r.due ? formatDate(r.due) : dash("")) },
    { id: "delivery", label: "Email delivery", defaultHidden: true, mobile: "hidden", cell: (r) => (r.delivery && r.delivery !== "—" ? <StatusBadge domain="delivery" status={r.delivery} /> : <span className="text-muted-foreground">Not sent</span>) },
    { ...updated(), defaultHidden: true, mobile: "hidden" },
  ],
  deliveries: [
    { id: "name", label: "Message", sortKey: "name", essential: true, mobile: "title", cell: (r) => <Link href={href("deliveries", r)} className="rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">{messageName(r.name)}</Link> },
    { id: "recipient", label: "Recipient", mobile: "subtitle", className: "max-w-64 truncate", cell: (r) => dash(r.email || r.phone) },
    { id: "status", label: "Status", sortKey: "status", mobile: "status", cell: (r) => <StatusBadge domain="delivery" status={r.status} /> },
    { ...updated(), label: "Created" },
  ],
};

const currency: FilterDef = { key: "currency", label: "Currency", type: "select", allLabel: "All currencies", options: [{ value: "UGX", label: "UGX" }, { value: "USD", label: "USD" }] };
const division: FilterDef = { key: "division", label: "Division", type: "select", allLabel: "All divisions", options: divisions.map((d) => ({ value: d, label: titleCase(d) })) };
const filters: Record<SalesTableEntity, FilterDef[]> = {
  clients: [{ key: "kind", label: "Client type", type: "select", allLabel: "All types", options: [{ value: "individual", label: "Individual" }, { value: "company", label: "Company" }] }],
  projects: [],
  invoices: [
    { key: "payment", label: "Payment", type: "select", allLabel: "Any payment state", options: Object.entries(statusRegistry.invoicePayment).map(([value, s]) => ({ value, label: s.label })) },
    currency,
    division,
    { key: "from", label: "Updated from", type: "date" },
    { key: "to", label: "Updated through", type: "date" },
  ],
  deliveries: [],
};
const chipDomain = { clients: "client", projects: "project", invoices: "invoice", deliveries: "delivery" } as const;
const labels: Record<SalesTableEntity, { label: string; search: string; open: string }> = {
  clients: { label: "Clients", search: "Search client name, email or phone", open: "Open client" },
  projects: { label: "Projects", search: "Search project, code or client", open: "Open project" },
  invoices: { label: "Invoices", search: "Search number, client or project", open: "Open invoice" },
  deliveries: { label: "Deliveries", search: "Search message or recipient", open: "Delivery details" },
};

function actions(entity: SalesTableEntity, row: Row): RowAction[] {
  const open: RowAction = { label: labels[entity].open, href: href(entity, row), icon: entity === "deliveries" ? <MailIcon /> : <FileTextIcon /> };
  const client = row.client_id ? [{ label: "Open client", href: `/admin/clients/${row.client_id}`, icon: <UserRoundIcon /> }] : [];
  if (entity === "clients") return [open, { label: "Projects for this client", href: `/admin/projects?clientId=${row.id}`, icon: <FolderKanbanIcon /> }];
  if (entity === "invoices") return [open, ...client, ...(row.status === "draft" ? [] : [{ label: "Download PDF", href: `/api/sales/invoices/${row.id}/pdf`, external: true, icon: <ExternalLinkIcon /> }])];
  if (entity === "projects") return [open, ...client];
  return [open];
}

export function SalesTable({
  entity,
  rows,
  total,
  query,
  emptyAction,
  summary,
}: {
  entity: SalesTableEntity;
  rows: ListRow[];
  total: number;
  query: QueryState;
  emptyAction?: React.ReactNode;
  summary: { currency: string; total: string; due?: string }[];
}) {
  const { label, search } = labels[entity];
  const domain = statusRegistry[chipDomain[entity]] as Record<string, { label: string }>;
  return (
    <DataTable
      tableId={entity}
      label={label}
      columns={columns[entity]}
      rows={rows as Row[]}
      total={total}
      query={query}
      values={{ status: query.status, kind: query.kind, payment: query.payment, currency: query.currency, division: query.division, from: query.from, to: query.to }}
      getRowId={(r) => r.id}
      getRowLabel={(r) => (entity === "invoices" ? r.number : r.name)}
      searchPlaceholder={search}
      statusChips={{ key: "status", label: "Status", options: Object.entries(domain).map(([value, s]) => ({ value, label: s.label })) }}
      filters={filters[entity]}
      rowActions={(r) => actions(entity, r)}
      emptyAction={emptyAction}
      footer={
        entity !== "deliveries" && entity !== "clients" && summary.length > 0 && (
          <span className="tabular-nums">
            Matching total: {summary.map((s) => formatMoney(s.currency, s.total)).join(" · ")}
            {entity === "invoices" && <> · Outstanding: {summary.map((s) => formatMoney(s.currency, s.due ?? "0")).join(" · ")}</>}
          </span>
        )
      }
    />
  );
}
