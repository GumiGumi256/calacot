import { randomUUID } from "node:crypto";
import { staffContext } from "@/lib/sales/permissions";
import { readCompanySettings } from "@/lib/admin/settings";
import { sectionLabels } from "@/lib/admin/settings-schema";
import { salesConfig } from "@/lib/sales/config";
import { DecideProposal, SettingsForm } from "@/components/admin/settings-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Page() {
  const ctx = await staffContext("settings_manage");
  const s = await readCompanySettings(ctx.organizationId);
  let tax = "Not configured";
  try { const c = salesConfig(); tax = `${c.taxRate}% approved tax rate; invoices due ${c.dueDays} days after issue; initial billing policy: ${c.policy}`; } catch { /* shown as not configured */ }
  const p = s.proposal;
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {p && (
        <Card className="border-amber-500/50">
          <CardHeader><CardTitle>Payment-instruction change awaiting approval</CardTitle><CardDescription>Proposed {p.proposed_at.slice(0, 16).replace("T", " ")}: {p.note}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="font-medium">Current</p><PaymentSummary payment={s.settings.payment} /></div>
              <div><p className="font-medium">Proposed</p><PaymentSummary payment={p.settings.payment} /></div>
            </div>
            <DecideProposal versionId={p.id} canDecide={p.proposed_by !== ctx.actor} />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle as="h1">Company settings</CardTitle>
          <CardDescription>Business details used on new documents and customer messages. Changes never alter quotations or invoices already issued. Infrastructure secrets (API keys, database, webhook and provider credentials) are managed in deployment configuration and are never shown here.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{s.saved ? `Version ${s.version}.` : "Not saved yet: showing the current organization record and deployment payment configuration."}</p>
          <SettingsForm initialSettings={s.settings} version={s.version} requestKey={randomUUID()} locked={!!p} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Tax and accounting rules</CardTitle><CardDescription>Read-only. Changing them requires explicit authorization and a reviewed deployment change.</CardDescription></CardHeader>
        <CardContent><p className="text-sm">{tax}</p></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Settings history</CardTitle><CardDescription>Most recent 20 versions. History cannot be edited or deleted.</CardDescription></CardHeader>
        <CardContent>
          {s.history.length ? (
            <ol className="flex flex-col gap-2 text-sm">{s.history.map((h) => <li key={h.id} className="border-l-2 pl-3"><p className="font-medium">Version {h.version}: {h.status}</p><p className="text-muted-foreground">{h.changed_sections.map((x) => sectionLabels[x] ?? x).join(", ")}. {h.note}{h.decision_note ? ` Decision: ${h.decision_note}` : ""}</p></li>)}</ol>
          ) : <p className="text-sm text-muted-foreground">No settings changes recorded.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentSummary({ payment }: { payment: { bank: { name: string; number: string; account: string; currency: string } | null; mobile: { network: string; number: string; account: string; currency: string } | null } }) {
  return (
    <ul className="mt-1 flex flex-col gap-1">
      <li>Bank: {payment.bank ? `${payment.bank.name}, ${payment.bank.account}, ${payment.bank.number} (${payment.bank.currency})` : "Not offered"}</li>
      <li>Mobile money: {payment.mobile ? `${payment.mobile.network}, ${payment.mobile.account}, ${payment.mobile.number} (${payment.mobile.currency})` : "Not offered"}</li>
    </ul>
  );
}
