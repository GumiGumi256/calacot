import { sql } from "drizzle-orm";

// Call only after server-side Clerk membership + finance-read authorization.
// organizationId must come from that verified context, never a client-submitted value.
// Each correlated aggregate is separate to avoid multiplying allocations by credit-note rows.
export function invoiceBalancesSql(organizationId: string) {
  return sql`
    WITH balances AS (
      SELECT
        i.id, i.number, i.client_id, i.currency, i.total, i.due_on,
        COALESCE((
          SELECT SUM(a.amount)
          FROM payment_allocations a
          JOIN payments p ON p.id = a.payment_id AND p.organization_id = a.organization_id
          WHERE a.organization_id = i.organization_id AND a.invoice_id = i.id
            AND p.status = 'confirmed'
        ), 0) - COALESCE((
          SELECT SUM(r.amount)
          FROM payment_allocation_reversals r
          JOIN payment_refunds f ON f.id = r.refund_id AND f.organization_id = r.organization_id
          JOIN payment_allocations a ON a.id = r.allocation_id AND a.organization_id = r.organization_id
          JOIN payments p ON p.id = a.payment_id AND p.organization_id = a.organization_id
          WHERE a.organization_id = i.organization_id AND a.invoice_id = i.id
            AND f.status = 'completed' AND p.status = 'confirmed'
        ), 0) AS net_paid,
        COALESCE((
          SELECT SUM(c.total) FROM credit_notes c
          WHERE c.organization_id = i.organization_id AND c.invoice_id = i.id
            AND c.status = 'issued'
        ), 0) AS credited
      FROM invoices i
      WHERE i.organization_id = ${organizationId} AND i.status = 'issued'
    )
    SELECT *, total - net_paid - credited AS balance_raw,
      GREATEST(total - net_paid - credited, 0) AS amount_due,
      GREATEST(net_paid + credited - total, 0) AS credit_balance
    FROM balances
    ORDER BY due_on NULLS LAST, number
  `;
}
