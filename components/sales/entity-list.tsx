"use client";
import { useCallback, useMemo, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { DataTable, type FilterConfig } from "./data-table";
import { entityColumns, statusLabel } from "./columns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Entity, ListRow, QueryState } from "@/lib/sales/contracts";
import type { Permission } from "@/lib/sales/permissions";
import { ClientForm } from "./client-form";
const statuses: Record<Entity, string[]> = {
  clients: ["active", "archived"],
  projects: ["planned", "active", "on_hold", "completed", "cancelled"],
  quotations: [
    "draft",
    "sent",
    "accepted",
    "declined",
    "expired",
    "superseded",
  ],
  invoices: ["draft", "issued", "void"],
  deliveries: [
    "queued",
    "processing",
    "provider_accepted",
    "delivered",
    "read",
    "failed",
    "blocked",
    "suppressed",
    "uncertain",
    "captured",
    "skipped",
  ],
};
export function EntityList({
  entity,
  rows,
  total,
  query,
  permissions,
}: {
  entity: Entity;
  rows: ListRow[];
  total: number;
  query: QueryState;
  permissions: Permission[];
}) {
  const router = useRouter(),
    path = usePathname();
  const [pending, start] = useTransition();
  const change = useCallback(
    (q: QueryState) => {
      const p = new URLSearchParams();
      for (const [key, value] of Object.entries(q))
        if (value !== "") p.set(key, String(value));
      start(() => router.push(`${path}?${p.toString()}`, { scroll: false }));
    },
    [router, path],
  );
  const columns = useMemo(() => entityColumns(entity), [entity]);
  const filters: FilterConfig[] = [
    {
      key: "status",
      label: "Status",
      values: statuses[entity].map((value) => ({
        value,
        label: statusLabel(value),
      })),
    },
  ];
  if (entity === "clients")
    filters.push({
      key: "kind",
      label: "Client type",
      values: ["individual", "company"].map((value) => ({
        value,
        label: value,
      })),
    });
  if (["quotations", "invoices"].includes(entity))
    filters.push(
      {
        key: "currency",
        label: "Currency",
        values: ["UGX", "USD"].map((value) => ({ value, label: value })),
      },
      {
        key: "division",
        label: "Division",
        values: [
          "estates",
          "architecture",
          "painting",
          "interiors",
          "tech",
        ].map((value) => ({ value, label: value })),
      },
    );
  if (entity === "invoices")
    filters.push({
      key: "payment",
      label: "Payment",
      values: ["paid", "unpaid", "partial", "overdue"].map((value) => ({
        value,
        label: value,
      })),
    });
  return (
    <DataTable
      columns={columns}
      rows={rows}
      total={total}
      query={query}
      onQuery={change}
      filters={filters}
      getRowId={(r) => r.id}
      loading={pending}
      toolbar={
        <>
          {["quotations", "invoices"].includes(entity) && (["from", "to"] as const).map(key => (
            <div key={key} className="flex flex-col gap-2">
              <Label htmlFor={`date-${key}`}>{key === "from" ? "From date" : "Through date"}</Label>
              <Input id={`date-${key}`} type="date" value={query[key]} onChange={e => change({...query, [key]: e.target.value, page: 1})}/>
            </div>
          ))}
          {entity === "clients" && permissions.includes("clients_write") && (
            <ClientForm />
          )}
          {entity === "projects" && permissions.includes("projects_write") && (
            <Button render={<Link href="/admin/projects/new" />}>
              Create planned project
            </Button>
          )}
          {entity === "quotations" &&
            permissions.includes("quotations_create") && (
              <Button render={<Link href="/admin/quotations/new" />}>
                New quotation
              </Button>
            )}
          {["quotations", "invoices", "clients"].includes(entity) && (
            <Button
              variant="outline"
              render={
                <a
                  href={`/api/sales/${entity}/export?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`}
                />
              }
            >
              Export matching records (up to 1,000)
            </Button>
          )}
        </>
      }
    />
  );
}
