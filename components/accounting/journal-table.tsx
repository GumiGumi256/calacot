import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { ledgerAmount } from "@/lib/accounting/format";
import type { JournalListRow } from "@/lib/accounting/reads";

const label = (j: JournalListRow) => j.number ?? (j.status === "draft" ? "Draft" : "Unposted");
const currencies = (j: JournalListRow) => (j.currencies?.length ? j.currencies.join(" + ") : "");

/** Journal list: table from 768px, cards below. Totals are functional-currency debits. */
export function JournalTable({ rows }: { rows: JournalListRow[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Journal</TableHead><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Prepared by</TableHead>
              <TableHead className="text-right">Total debits</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="whitespace-nowrap"><Link href={`/admin/accounting/journals/${j.id}`} className="font-medium underline-offset-4 hover:underline">{label(j)}</Link>{j.journal_type === "reversal" && <div className="text-xs text-muted-foreground">Reversal</div>}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(j.entry_date)}</TableCell>
                <TableCell className="max-w-96"><span className="line-clamp-2 break-words">{j.description}</span>{j.reference && <div className="text-xs text-muted-foreground">Ref {j.reference}</div>}</TableCell>
                <TableCell>{j.prepared_by}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{ledgerAmount(j.total)} <span className="text-xs text-muted-foreground">{currencies(j)}</span></TableCell>
                <TableCell className="whitespace-nowrap"><StatusBadge domain="journal" status={j.status} />{j.reversed_by && <div className="mt-1 text-xs text-muted-foreground">Reversed by {j.reversed_by}</div>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((j) => (
          <li key={j.id} className="rounded-(--card-radius-inner) border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/admin/accounting/journals/${j.id}`} className="font-medium underline-offset-4 hover:underline">{label(j)}</Link>
              <StatusBadge domain="journal" status={j.status} />
            </div>
            <p className="mt-1 line-clamp-2 text-sm break-words">{j.description}</p>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{formatDate(j.entry_date)} · {j.prepared_by}</span><span className="tabular-nums">{ledgerAmount(j.total)} {currencies(j)}</span></div>
          </li>
        ))}
      </ul>
    </>
  );
}
