"use client";
import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import type { DataTableFeatures } from "./table-features";
import type { Entity, ListRow } from "@/lib/sales/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
const helper = createColumnHelper<DataTableFeatures, ListRow>();
export const statusLabel = (s: string) =>
  s === "accepted" ? "Confirmed" : s.replaceAll("_", " ");
export function entityColumns(entity: Entity) {
  const name = helper.accessor("name", {
    header: entity === "clients" ? "Client" : "Title",
    cell: (c) => <span className="font-medium">{c.getValue()}</span>,
  });
  const number = helper.accessor("number", { header: "Number / revision" });
  const client = helper.accessor("client", {
    header: "Client",
    enableSorting: false,
  });
  const project = helper.accessor("project", {
    header: "Project",
    enableSorting: false,
  });
  const status = helper.accessor("status", {
    header: "Status",
    cell: (c) => <Badge variant="secondary">{statusLabel(c.getValue())}</Badge>,
  });
  const total = helper.accessor("total", {
    header: "Total",
    cell: (c) => `${c.row.original.currency} ${c.getValue()}`,
  });
  const created = helper.accessor("created", {
    header: "Updated",
    cell: (c) => c.getValue().slice(0, 10),
  });
  const action = helper.display({
    id: "actions",
    header: "Actions",
    enableHiding: false,
    cell: (c) =>
      entity === "deliveries" ? (
        <Link href={`/admin/deliveries/${c.row.original.id}`}>
          Delivery details
        </Link>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/admin/${entity}/${c.row.original.id}`} />}
        >
          Open
        </Button>
      ),
  });
  if (entity === "clients")
    return helper.columns([
      name,
      helper.accessor("kind", { header: "Type", enableSorting: false }),
      helper.accessor("email", {
        header: "Primary email",
        enableSorting: false,
      }),
      helper.accessor("phone", { header: "Phone", enableSorting: false }),
      helper.accessor("activeProjects", {
        header: "Active projects",
        enableSorting: false,
      }),
      helper.accessor("balance", { header: "Outstanding by currency", enableSorting: false }),
      status,
      created,
      action,
    ]);
  if (entity === "projects")
    return helper.columns([
      name,
      number,
      client,
      helper.accessor("division", { header: "Division", enableSorting: false }),
      status,
      created,
      action,
    ]);
  if (entity === "deliveries")
    return helper.columns([
      name,
      status,
      helper.accessor("email", { header: "Email", enableSorting: false }),
      helper.accessor("phone", { header: "Phone", enableSorting: false }),
      created,
      action,
    ]);
  return helper.columns([
    number,
    client,
    project,
    status,
    total,
    ...(entity === "invoices"
      ? [
          helper.accessor("payment", {
            header: "Payment state",
            enableSorting: false,
          }),
          helper.accessor("balance", {
            header: "Amount due",
            enableSorting: false,
            cell: (c) => `${c.row.original.currency} ${c.getValue()}`,
          }),
        ]
      : []),
    helper.accessor("due", {
      header: entity === "quotations" ? "Valid until" : "Due",
      cell: (c) => c.getValue().slice(0, 10),
    }),
    helper.accessor("delivery", {
      header: "Email delivery",
      enableSorting: false,
    }),
    created,
    action,
  ]);
}
