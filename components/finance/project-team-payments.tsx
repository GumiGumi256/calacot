import Link from "next/link";
import { expenseStatusLabels, formatAmount } from "@/lib/finance/options";
import { formatDate } from "@/lib/format";
import type { TeamPaymentRow } from "@/lib/projects/workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** How much each project team member has been allocated and paid, from expense breakdowns. */
export function ProjectTeamPayments({ rows }: { rows: TeamPaymentRow[] }) {
  const currencies = [...new Set(rows.map((r) => r.currency))];
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Payments by person</CardTitle>
        <CardDescription>
          Each team member&apos;s share of project expenses. A share counts as paid once its expense is paid in full. Drafts, returned, rejected and cancelled requests are not included.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expense on this project has been split by person yet. When you record a lump sum, such as painters&apos; wages, add each person&apos;s share under &quot;Who received this money?&quot;.</p>
        ) : currencies.map((currency) => {
          const list = rows.filter((r) => r.currency === currency);
          // Exact decimal sum (amounts arrive as numeric(17,2) text).
          const sum = (k: "paid" | "approved" | "pending") => {
            const c = list.reduce((s, r) => { const [w, f = ""] = r[k].split("."); return s + BigInt(w + f.padEnd(2, "0")); }, BigInt(0));
            return `${c / BigInt(100)}.${(c % BigInt(100)).toString().padStart(2, "0")}`;
          };
          return (
            <Table key={currency} className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Person ({currency})</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Approved, not yet paid</TableHead>
                  <TableHead className="text-right">Awaiting approval</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => (
                  <TableRow key={r.member_id} className="align-top">
                    <TableCell className="whitespace-normal">
                      <details>
                        <summary className="cursor-pointer font-medium">{r.name}{r.detail ? <span className="font-normal text-muted-foreground"> · {r.detail}</span> : null}</summary>
                        <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
                          {r.lines.map((l) => (
                            <li key={l.expenseId}>
                              {formatDate(l.incurredOn)}: <Link className="underline-offset-4 hover:underline" href={`/admin/expenses/${l.expenseId}`}>{l.description}</Link> · {formatAmount(currency, l.amount)} · {expenseStatusLabels[l.status] ?? l.status}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatAmount(currency, r.paid)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(currency, r.approved)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(currency, r.pending)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatAmount(currency, sum("paid"))}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(currency, sum("approved"))}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(currency, sum("pending"))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          );
        })}
      </CardContent>
    </Card>
  );
}
