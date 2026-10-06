import Link from "next/link";
import { clientDetail } from "@/lib/sales/reads";
import { clientSchema, divisions } from "@/lib/sales/contracts";
import type { z } from "zod";
import { ClientForm } from "@/components/sales/client-form";
import { TransitionControls } from "@/components/sales/transition-controls";
import { Activity } from "@/components/sales/activity";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = await clientDetail(id),
    c = d.client;
  const address = (c.billing_address || {}) as Record<string, string>;
  const initial: z.input<typeof clientSchema> = {
    id,
    kind: c.kind === "company" ? "company" : "individual",
    displayName: String(c.display_name),
    legalName: String(c.legal_name || ""),
    tradingName: String(c.trading_name || (c.kind === "company" && c.display_name !== c.legal_name ? c.display_name : "") || ""),
    department: divisions.find(value => value === c.department),
    taxIdentifier: String(c.tax_identifier || ""),
    billingAddress: {
      line1: address.line1 || "",
      city: address.city || "",
      country: address.country || "",
    },
    contacts: d.contacts.map((contact) => ({
      id: String(contact.id),
      name: String(contact.name),
      email: String(contact.email || ""),
      phone: String(contact.phone || ""),
      isPrimary: Boolean(contact.is_primary),
    })),
  };
  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>{String(c.display_name)}</CardTitle>
          <CardDescription>
            {String(c.department || "Department not assigned")} ·{" "}
            {String(c.kind)} · {c.archived_at ? "Archived" : "Active"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p>
            {initial.legalName} ·{" "}
            {Object.values(initial.billingAddress).filter(Boolean).join(", ")}
          </p>
          {d.permissions.includes("clients_write") && (
            <ClientForm initial={initial} />
          )}
          <TransitionControls
            entity="clients"
            id={id}
            status={c.archived_at ? "archived" : "active"}
            permissions={d.permissions}
            summary={String(c.display_name)}
          />
          <ul>
            {d.contacts.map((contact) => (
              <li key={String(contact.id)}>
                {String(contact.name)} · {String(contact.email || "")} ·{" "}
                {String(contact.phone || "")}
                {contact.is_primary ? " · Primary" : ""}
              </li>
            ))}
          </ul>
          {d.balances.map((b) => (
            <p key={String(b.currency)}>
              {String(b.currency)} outstanding: {String(b.balance)}
            </p>
          ))}
        </CardContent>
      </Card>
      {[
        {
          title: "Projects",
          rows: d.projects,
          route: "projects",
          label: "name",
        },
        {
          title: "Quotations",
          rows: d.quotes,
          route: "quotations",
          label: "title",
        },
        {
          title: "Invoices",
          rows: d.invoices,
          route: "invoices",
          label: "number",
        },
      ].map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
            <CardDescription>
              Most recent 50 ·{" "}
              <Link href={`/admin/${group.route}?clientId=${id}`}>
                View matching records
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {group.rows.map((r) => (
                <li key={String(r.id)}>
                  <Link href={`/admin/${group.route}/${r.id}`}>
                    {String(r[group.label] || "Draft")}
                  </Link>
                  {r.balance ? ` · ${r.currency} ${r.balance} due` : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      <Activity events={d.activity} />
    </main>
  );
}
