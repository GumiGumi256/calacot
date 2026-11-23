import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { FsEvent } from "@/lib/statements/reads";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const statementSections = [
  { href: "/admin/accounting/statements", label: "Statements" },
  { href: "/admin/accounting/statements/adjustments", label: "Adjustments" },
  { href: "/admin/accounting/statements/classification", label: "Statement settings" },
];

export function StatementsNav({ current }: { current: string }) {
  return (
    <nav aria-label="Financial statement sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 print:hidden">
      {statementSections.map((s) => <Button key={s.href} size="sm" variant={current === s.href ? "secondary" : "ghost"} className="shrink-0" render={<Link href={s.href} aria-current={current === s.href ? "page" : undefined} />}>{s.label}</Button>)}
    </nav>
  );
}

/**
 * Status line printed at the top of every statement view and export. Anything that is not an
 * approved snapshot says so plainly, so a printout can never be mistaken for approved statements.
 */
export function StatementStatus({ approved, provisional, generatedAt, openPeriods }: { approved: boolean; provisional: boolean; generatedAt: string; openPeriods?: number }) {
  const text = approved
    ? "Approved statements (immutable snapshot)."
    : `DRAFT — computed from the posted ledger on ${generatedAt}. Not approved.${provisional ? " PROVISIONAL: unresolved classification or reconciliation items." : ""}`;
  return (
    <p role="note" className={approved ? "text-sm font-medium text-success" : "text-sm font-medium text-warning"}>
      {text}{openPeriods ? ` ${openPeriods} period${openPeriods === 1 ? " is" : "s are"} still open, so figures can change.` : ""} Internal management information, not audited.
    </p>
  );
}

export function FsHistory({ events, title = "History" }: { events: FsEvent[]; title?: string }) {
  return (
    <Card>
      <CardHeader><CardTitle as="h2">{title}</CardTitle><CardDescription>Every action is recorded and cannot be edited.</CardDescription></CardHeader>
      <CardContent>
        {events.length === 0 ? <p className="text-sm text-muted-foreground">No history recorded.</p> : (
          <ol className="flex flex-col gap-3">
            {events.map((e) => (
              <li key={e.id} className="border-l-2 border-border pl-3 text-sm">
                <div className="font-medium capitalize">{e.entity_type.replaceAll("_", " ")}: {e.action.replaceAll("_", " ")}</div>
                <div className="text-xs text-muted-foreground">{e.actor} · {formatDateTime(e.created_at)}</div>
                {e.note && <p className="mt-1 wrap-break-word">{e.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
