import { randomUUID } from "node:crypto";
import { readMappingsPage } from "@/lib/accounting/integration";
import { conditionLabels, eventLabel, integrationEvents } from "@/lib/accounting/integration-catalog";
import { AccountingNav } from "@/components/accounting/shared";
import { DecideMapping, ProposeMapping } from "@/components/accounting/integration-forms";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";

const account = (a: { code?: string; byDivision?: Record<string, string>; fallback?: string }) =>
  a.code ?? `${Object.entries(a.byDivision ?? {}).map(([d, c]) => `${d} ${c}`).join(", ")}${a.fallback ? `; otherwise ${a.fallback}` : ""}`;

export default async function Page() {
  const d = await readMappingsPage();
  return (
    <PageContainer>
      <PageHeader
        title="Event mappings"
        description="Which ledger accounts each business event posts to. Proposed by finance, approved by a second person with policy-approval authority, versioned and kept forever. Events that match no approved mapping wait in the exception queue."
        primaryAction={d.can.propose && <ProposeMapping requestKey={randomUUID()} today={d.today} accounts={d.accounts} />}
      />
      <AccountingNav current="/admin/accounting/integration" />
      <Card>
        <CardHeader><CardTitle as="h2">How a mapping is chosen</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>Only approved mappings whose every condition matches the event are considered; the one with the most conditions wins, then the highest priority. A tie is refused as ambiguous.</li>
            <li>Taxed documents only use a mapping approved with the condition Tax treatment = taxed.</li>
            <li>Voids reverse the original entry exactly; they are never mapped.</li>
            <li>Expense approval and disbursement reconciliation have no accounting effect unless a mapping is approved for them. A disbursement for an expense that was already recognized uses the mapping with Expense already recognized = yes, so the cost is never counted twice.</li>
            <li>Only functional-currency events can post. Events in other currencies stay blocked until an exchange-rate policy is approved.</li>
          </ul>
        </CardContent>
      </Card>
      {d.mappings.length === 0 ? <EmptyState kind="no-records" title="No mappings yet" description="Every event will wait in the exception queue until mappings are approved." /> : (
        integrationEvents.filter((e) => d.mappings.some((m) => m.event_type === e.type)).map((e) => (
          <Card key={e.type}>
            <CardHeader><CardTitle as="h2">{e.label}</CardTitle><CardDescription>{e.when}</CardDescription></CardHeader>
            <CardContent className="flex flex-col divide-y">
              {d.mappings.filter((m) => m.event_type === e.type).map((m) => (
                <div key={m.id} className="flex flex-col gap-2 py-3 first:pt-0 lg:flex-row lg:justify-between">
                  <div className="flex min-w-0 flex-col gap-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Version {m.version}</span><StatusBadge domain="accountingProposal" status={m.status} />{m.priority > 0 && <span className="text-xs text-muted-foreground">priority {m.priority}</span>}</div>
                    <p className="break-words">{m.description}</p>
                    <p className="text-muted-foreground">When: {Object.keys(m.conditions).length ? Object.entries(m.conditions).map(([k, v]) => `${conditionLabels[k] ?? k} = ${v}`).join(", ") : "any event of this type"}{m.policy_version ? `; policy version ${m.policy_version}` : ""}; from {formatDate(m.effective_from)}</p>
                    {m.treatment === "no_entry" ? <p>No accounting entry.</p> : (
                      <ul className="flex flex-col gap-0.5 font-mono text-xs">
                        {(m.definition.lines ?? []).map((l, i) => <li key={i}>{l.side === "debit" ? "Dr" : "Cr"} {account(l.account)} · {l.amount}{l.memo ? ` · ${l.memo}` : ""}</li>)}
                      </ul>
                    )}
                    <p className="text-xs text-muted-foreground">Proposed by {m.proposed_by}, {formatDate(m.proposed_at)}{m.decided_by ? `; decided by ${m.decided_by}, ${formatDate(m.decided_at)}` : ""}{m.decision_note ? `: ${m.decision_note}` : ""}</p>
                  </div>
                  <div className="lg:w-72 lg:shrink-0">
                    {d.can.approve && m.status === "proposed" && m.proposed_by_id !== d.me && <DecideMapping id={m.id} requestKey={randomUUID()} status={m.status} label={`${eventLabel(m.event_type)} version ${m.version}`} />}
                    {d.can.approve && m.status === "proposed" && m.proposed_by_id === d.me && <p className="text-sm text-muted-foreground">You proposed this, so someone else must decide.</p>}
                    {d.can.approve && m.status === "approved" && <DecideMapping id={m.id} requestKey={randomUUID()} status={m.status} label={`${eventLabel(m.event_type)} version ${m.version}`} />}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </PageContainer>
  );
}
