import { formatAmount } from "@/lib/finance/options";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddProjectMember, RemoveProjectMember, SetAgreedPay } from "./project-team-actions";

export function ProjectTeam({ projectId, currency, members, staff, canManage, showPay }: { projectId: string; currency: string; members: Record<string, unknown>[]; staff: { id: string; name: string }[]; canManage: boolean; showPay: boolean }) {
  return <Card>
    <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3"><div className="space-y-1"><div className="flex items-center gap-2"><CardTitle>Project team</CardTitle><Badge variant="neutral">{members.length}{members.length === 100 ? "+" : ""}</Badge></div><CardDescription>Showing up to 100 members.</CardDescription></div>{canManage && <AddProjectMember projectId={projectId} staff={staff} currency={currency} />}</CardHeader>
    <CardContent>{members.length ? <ul className="space-y-2">{members.map(m => {
      const id = String(m.id), name = String(m.name);
      const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
      const detail = [m.responsibility, m.external_company].filter(Boolean).map(String).join(" · ") || (m.staff_id ? "Calacot staff" : "External member");
      return <li key={id} className="rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Avatar><AvatarFallback>{initials}</AvatarFallback></Avatar><div className="min-w-0"><p className="font-medium break-words">{name}</p><p className="text-xs text-muted-foreground break-words">{detail}</p></div></div>{showPay && m.agreed_amount !== null && <Badge variant="outline" className="tabular-nums">{formatAmount(currency, String(m.agreed_amount))}</Badge>}</div>
        {(canManage || !!m.external_phone || !!m.external_email) && <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Member details{canManage ? " and actions" : ""}</summary><div className="mt-2 space-y-2">{!!m.external_phone && <p>{String(m.external_phone)}</p>}{!!m.external_email && <p>{String(m.external_email)}</p>}{canManage && <div className="flex flex-wrap items-center gap-1"><SetAgreedPay projectId={projectId} memberId={id} name={name} currency={currency} amount={m.agreed_amount === null ? null : String(m.agreed_amount)} /><RemoveProjectMember projectId={projectId} memberId={id} name={name} /></div>}</div></details>}
      </li>;
    })}</ul> : <p className="text-sm text-muted-foreground">No project members have been recorded.</p>}</CardContent>
  </Card>;
}
