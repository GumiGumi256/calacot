import Link from "next/link";
import { CheckCircle2Icon, CircleDashedIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { journalActionLabels, ledgerAmount } from "@/lib/accounting/format";
import type { EventRow } from "@/lib/accounting/reads";
import { staffContext, type Permission } from "@/lib/sales/permissions";

const sections: { href: string; label: string; anyOf?: Permission[] }[] = [
  { href: "/admin/accounting", label: "Overview" },
  { href: "/admin/accounting/accounts", label: "Chart of accounts" },
  { href: "/admin/accounting/journals", label: "Journals" },
  { href: "/admin/accounting/ledger", label: "General ledger", anyOf: ["fs_read"] },
  { href: "/admin/accounting/banking", label: "Banking & cash", anyOf: ["banking_read"] },
  { href: "/admin/accounting/reconciliation", label: "Reconciliation", anyOf: ["banking_read"] },
  { href: "/admin/accounting/assets", label: "Fixed assets", anyOf: ["assets_manage", "depreciation_approve", "accounting_read"] },
  { href: "/admin/accounting/tax", label: "Tax management", anyOf: ["tax_read"] },
  { href: "/admin/accounting/statements", label: "Financial statements", anyOf: ["fs_read"] },
  { href: "/admin/accounting/closing", label: "Period closing", anyOf: ["fs_read"] },
  { href: "/admin/accounting/payroll", label: "Payroll", anyOf: ["payroll_admin", "payroll_approve"] },
  { href: "/admin/accounting/migration", label: "Opening balances", anyOf: ["migration_prepare", "migration_approve"] },
  { href: "/admin/accounting/trial-balance", label: "Trial balance" },
  { href: "/admin/accounting/periods", label: "Periods" },
  { href: "/admin/accounting/policy", label: "Policy and rates" },
  { href: "/admin/accounting/integration", label: "Integration" },
];

/**
 * Section tabs. Plain links, so they work without JavaScript and keep the URL meaningful. Tabs for
 * restricted areas (payroll, tax) are shown only to people who hold the permission; the pages
 * themselves still authorize every request.
 */
export async function AccountingNav({ current }: { current: string }) {
  let granted: Permission[] = [];
  try { granted = (await staffContext()).permissions; } catch { granted = []; }
  const visible = sections.filter((s) => !s.anyOf || s.anyOf.some((p) => granted.includes(p)));
  return (
    <nav aria-label="Accounting sections" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {visible.map((s) => (
        <Button key={s.href} size="sm" variant={current === s.href ? "default" : "outline"} className="shrink-0" render={<Link href={s.href} aria-current={current === s.href ? "page" : undefined} />}>
          {s.label}
        </Button>
      ))}
    </nav>
  );
}

type Readiness = { checklist: { key: string; done: boolean; label: string; help: string }[]; postingReady: boolean };

/** Why posting is or is not possible, in plain words. Shown wherever a post button could appear. */
export function ReadinessPanel({ readiness, compact = false }: { readiness: Readiness; compact?: boolean }) {
  if (compact && readiness.postingReady) return null;
  return (
    <Card variant={readiness.postingReady ? "default" : "attention"} tone="warning">
      <CardHeader>
        <CardTitle as="h2">{readiness.postingReady ? "Ready for manual posting" : "Posting is not enabled"}</CardTitle>
        <CardDescription>
          {readiness.postingReady
            ? "Approved manual journals can be posted to the ledger. Invoices, payments and expenses are not posted automatically."
            : "Drafts and approvals can be prepared, but nothing reaches the ledger until every item below is complete."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2">
          {readiness.checklist.map((c) => (
            <li key={c.key} className="flex gap-2 text-sm">
              {c.done ? <CheckCircle2Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleDashedIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              <span><span className="font-medium">{c.label}</span><span className="sr-only">{c.done ? " (done)" : " (not done)"}</span><span className="block text-muted-foreground">{c.help}</span></span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Append-only audit history for an accounting record. */
export function History({ events, title = "History" }: { events: EventRow[]; title?: string }) {
  return (
    <Card>
      <CardHeader><CardTitle as="h2">{title}</CardTitle><CardDescription>Every change is recorded and cannot be edited.</CardDescription></CardHeader>
      <CardContent>
        {events.length === 0 ? <p className="text-sm text-muted-foreground">No history recorded.</p> : (
          <ol className="flex flex-col gap-3">
            {events.map((e) => (
              <li key={e.id} className="border-l-2 border-border pl-3 text-sm">
                <div className="font-medium">{journalActionLabels[e.action] ?? e.action.replaceAll("_", " ")}</div>
                <div className="text-xs text-muted-foreground">{e.actor} · {formatDateTime(e.created_at)}{e.version ? ` · version ${e.version}` : ""}</div>
                {e.note && <p className="mt-1 break-words">{e.note}</p>}
                {typeof e.changes?.number === "string" && <p className="mt-1 text-xs">Journal {e.changes.number}</p>}
                {typeof e.changes?.reversalNumber === "string" && <p className="mt-1 text-xs">Reversal {String(e.changes.reversalNumber)}</p>}
                {e.action === "created" && typeof e.changes?.debit === "string" && <p className="mt-1 text-xs tabular-nums">Debits {ledgerAmount(String(e.changes.debit))} · Credits {ledgerAmount(String(e.changes.credit))}</p>}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/** Debit/credit amount cell: right-aligned, tabular, blank when zero so the side is obvious. */
export function Amount({ value, strong = false }: { value: string | null | undefined; strong?: boolean }) {
  return <span className={strong ? "font-medium tabular-nums" : "tabular-nums"}>{ledgerAmount(value, { blankZero: true })}</span>;
}
