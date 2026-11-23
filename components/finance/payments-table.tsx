"use client";

import Link from "next/link";
import { ReceiptIcon, SearchIcon, UserRoundIcon } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, FilterDef, ListQuery, RowAction } from "@/components/data-table/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { statusRegistry } from "@/lib/ui/status";
import { formatDate, formatMoney } from "@/lib/format";
import type { PaymentRow } from "@/lib/admin/reads";
import { ShareDocument } from "@/components/sales/share-document";

const methodLabels: Record<string, string> = { mobile_money: "Mobile money", bank_transfer: "Bank transfer", cash: "Cash", other: "Other" };

/**
 * Payments register on the shared DataTable (Design System V1, Phase 5).
 * Data still comes from readPayments (payments_read, organization scope, received date order).
 * Verification and allocation stay on the invoice page, so rows link there.
 */
export function PaymentsTable({
  rows,
  total,
  query,
  values,
  summary,
  canSeeClients,
  canSeeInvoices,
  canShareReceipts,
}: {
  rows: PaymentRow[];
  total: number;
  query: ListQuery;
  values: Record<string, string>;
  summary: { currency: string; status: string; total: string }[];
  canSeeClients: boolean;
  canSeeInvoices: boolean;
  canShareReceipts: boolean;
}) {
  const invoiceLinks = (row: PaymentRow) =>
    row.invoices.length === 0 ? (
      <span className="text-muted-foreground">Not allocated</span>
    ) : (
      row.invoices.map((invoice, i) => (
        <span key={invoice.id}>
          {i > 0 && ", "}
          {canSeeInvoices ? (
            <Link className="underline-offset-4 hover:underline" href={`/admin/invoices/${invoice.id}`}>
              {invoice.number ?? "Draft"}
            </Link>
          ) : (
            invoice.number ?? "Draft"
          )}
        </span>
      ))
    );

  const columns: DataColumn<PaymentRow>[] = [
    { id: "share", label: "Share receipt", mobile: "meta", cell: (row) => canShareReceipts && row.status === "confirmed" && row.receipt_number ? <ShareDocument kind="receipt" id={row.id} /> : null },
    {
      id: "receipt",
      label: "Receipt",
      essential: true,
      mobile: "subtitle",
      cell: (row) => <span className="font-medium tabular-nums">{row.receipt_number ?? "Pending receipt"}</span>,
    },
    {
      id: "client",
      label: "Client",
      mobile: "title",
      className: "min-w-36 max-w-60 whitespace-normal",
      cell: (row) =>
        canSeeClients ? (
          <Link className="underline-offset-4 hover:underline max-md:font-semibold" href={`/admin/clients/${row.client_id}`}>
            {row.client}
          </Link>
        ) : (
          row.client
        ),
    },
    { id: "amount", label: "Amount", align: "end", mobile: "meta", cell: (row) => formatMoney(row.currency, row.amount) },
    { id: "allocated", label: "Allocated", align: "end", mobile: "hidden", defaultHidden: true, cell: (row) => formatMoney(row.currency, row.allocated) },
    {
      id: "unallocated",
      label: "Unallocated",
      align: "end",
      mobile: "meta",
      cell: (row) =>
        row.status === "confirmed" ? (
          <span className={Number(row.unallocated) > 0 ? "text-warning" : undefined}>{formatMoney(row.currency, row.unallocated)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { id: "invoices", label: "Invoices", mobile: "hidden", className: "min-w-28 whitespace-normal", cell: invoiceLinks },
    {
      id: "method",
      label: "Method / reference",
      mobile: "hidden",
      className: "min-w-36 max-w-56 whitespace-normal",
      cell: (row) => (
        <span className="flex flex-col">
          <span>{methodLabels[row.method] ?? row.method}</span>
          <span className="type-caption break-all">{row.reference ?? "No reference"}</span>
        </span>
      ),
    },
    { id: "status", label: "Status", mobile: "status", cell: (row) => <StatusBadge domain="payment" status={row.status} /> },
    { id: "received", label: "Received", mobile: "meta", cell: (row) => formatDate(row.received_at) },
  ];

  const filters: FilterDef[] = [
    { key: "method", label: "Method", type: "select", allLabel: "All methods", options: Object.entries(methodLabels).map(([value, label]) => ({ value, label })) },
    { key: "currency", label: "Currency", type: "select", allLabel: "All currencies", options: [{ value: "UGX", label: "UGX" }, { value: "USD", label: "USD" }] },
    { key: "from", label: "Received from", type: "date" },
    { key: "to", label: "Received through", type: "date" },
  ];

  const rowActions = (row: PaymentRow): RowAction[] => [
    ...(row.status === "confirmed" && row.receipt_number ? [{ label: "Download receipt", href: `/api/sales/payments/${row.id}/receipt`, icon: <ReceiptIcon /> }] : []),
    ...(canSeeInvoices
      ? row.invoices.map((invoice) => ({
          label: row.status === "submitted" ? `Verify on invoice ${invoice.number ?? ""}`.trim() : `Open invoice ${invoice.number ?? ""}`.trim(),
          href: `/admin/invoices/${invoice.id}`,
          icon: <ReceiptIcon />,
        }))
      : []),
    // Not yet allocated: verification happens on an invoice, so open this client's issued invoices.
    ...(canSeeInvoices && row.status === "submitted" && row.invoices.length === 0
      ? [{ label: "Find invoice to verify", href: `/admin/invoices?status=issued&search=${encodeURIComponent(row.client)}`, icon: <SearchIcon /> }]
      : []),
    ...(canSeeClients ? [{ label: "Open client", href: `/admin/clients/${row.client_id}`, icon: <UserRoundIcon /> }] : []),
  ];

  // Matching totals per currency (all statuses), shown under the table.
  const byCurrency = new Map<string, number>();
  for (const s of summary) byCurrency.set(s.currency, (byCurrency.get(s.currency) ?? 0) + Number(s.total));

  return (
    <DataTable
      tableId="payments"
      label="Payments"
      columns={columns}
      rows={rows}
      total={total}
      query={query}
      values={values}
      getRowId={(row) => row.id}
      getRowLabel={(row) => `${row.receipt_number ?? "payment"} from ${row.client}`}
      searchPlaceholder="Search client, receipt or reference"
      statusChips={{
        key: "status",
        label: "Status",
        options: (["submitted", "confirmed", "rejected"] as const).map((s) => ({ value: s, label: statusRegistry.payment[s].label })),
      }}
      filters={filters}
      rowActions={rowActions}
      footer={
        byCurrency.size > 0 && (
          <span className="tabular-nums">
            Matching amount: {[...byCurrency].map(([currency, amount]) => formatMoney(currency, amount)).join(" · ")}
          </span>
        )
      }
    />
  );
}
