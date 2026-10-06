import { sql, type SQL } from "drizzle-orm";
import { literalSearch, type Entity, type QueryState } from "./contracts";
/** Correlated ledger sums deliberately avoid multiplying allocations/credits. */
export const balanceExpression = sql`CASE WHEN i.status='issued' THEN greatest(i.total
  - coalesce((SELECT sum(a.amount) FROM payment_allocations a JOIN payments p ON p.id=a.payment_id AND p.organization_id=a.organization_id WHERE a.invoice_id=i.id AND a.organization_id=i.organization_id AND p.status='confirmed'),0)
  - coalesce((SELECT sum(c.total) FROM credit_notes c WHERE c.invoice_id=i.id AND c.organization_id=i.organization_id AND c.status='issued'),0)
  + coalesce((SELECT sum(r.amount) FROM payment_allocation_reversals r JOIN payment_allocations a ON a.id=r.allocation_id AND a.organization_id=r.organization_id JOIN payment_refunds f ON f.id=r.refund_id AND f.organization_id=r.organization_id WHERE a.invoice_id=i.id AND a.organization_id=i.organization_id AND f.status='completed'),0),0) ELSE 0 END`;
const delivery = (type: string, id: SQL) =>
  sql`coalesce((SELECT d.status FROM delivery_intents d WHERE d.organization_id=c.organization_id AND d.entity_type=${type} AND d.entity_id=${id} AND d.channel='email' ORDER BY d.created_at DESC LIMIT 1),'—')`;
export function listBase(org: string, entity: Entity): SQL {
  if (entity === "clients")
    return sql`SELECT c.id,c.display_name AS name,'' AS number,c.display_name AS client,'' AS project,CASE WHEN c.archived_at IS NULL THEN 'active' ELSE 'archived' END AS status,c.kind,'' AS division,'' AS currency,'0.00' AS total,'' AS due,c.created_at AS created,coalesce(ct.email,'') AS email,coalesce(ct.phone,'') AS phone,'—' AS delivery,coalesce((SELECT string_agg(t.currency||' '||t.balance::text,', ' ORDER BY t.currency) FROM (SELECT i.currency,sum(${balanceExpression}) AS balance FROM invoices i WHERE i.organization_id=c.organization_id AND i.client_id=c.id GROUP BY i.currency)t),'—') AS balance,'' AS payment,(SELECT count(*)::int FROM projects p WHERE p.organization_id=c.organization_id AND p.client_id=c.id AND p.status IN ('planned','active') AND p.archived_at IS NULL) AS "activeProjects" FROM clients c LEFT JOIN client_contacts ct ON ct.organization_id=c.organization_id AND ct.client_id=c.id AND ct.is_primary WHERE c.organization_id=${org}`;
  if (entity === "projects")
    return sql`SELECT p.id,p.name,p.code AS number,c.display_name AS client,p.name AS project,p.status,'' AS kind,p.division,p.currency,coalesce(p.budget,0)::text AS total,coalesce(p.due_on::text,'') AS due,p.created_at AS created,'' AS email,'' AS phone,'—' AS delivery,'' AS balance,'' AS payment,0 AS "activeProjects",p.client_id FROM projects p JOIN clients c ON c.id=p.client_id AND c.organization_id=p.organization_id WHERE p.organization_id=${org} AND p.archived_at IS NULL`;
  if (entity === "quotations")
    return sql`SELECT q.id,q.title AS name,coalesce(q.number,'Draft')||' / R'||v.version AS number,c.display_name AS client,coalesce(p.name,'Missing historical project') AS project,CASE WHEN v.status='sent' AND v.valid_until<=now() THEN 'expired' ELSE v.status END AS status,'' AS kind,q.division,v.currency,v.total::text AS total,coalesce(v.valid_until::text,'') AS due,v.updated_at AS created,'' AS email,'' AS phone,${delivery("quotation", sql`v.id`)} AS delivery,'' AS balance,'' AS payment,0 AS "activeProjects",q.client_id FROM quotations q JOIN clients c ON c.id=q.client_id AND c.organization_id=q.organization_id JOIN LATERAL(SELECT * FROM quotation_versions vv WHERE vv.quotation_id=q.id AND vv.organization_id=q.organization_id ORDER BY vv.version DESC LIMIT 1)v ON true LEFT JOIN projects p ON p.id=q.project_id AND p.organization_id=q.organization_id WHERE q.organization_id=${org}`;
  if (entity === "invoices")
    return sql`SELECT i.id,coalesce(i.number,'Draft') AS name,coalesce(i.number,'Draft') AS number,c.display_name AS client,coalesce(p.name,'Legacy / unlinked') AS project,i.status,'' AS kind,coalesce(p.division,'') AS division,i.currency,i.total::text AS total,coalesce(i.due_on::text,'') AS due,i.created_at AS created,'' AS email,'' AS phone,${delivery("invoice", sql`i.id`)} AS delivery,(${balanceExpression})::text AS balance,CASE WHEN i.status<>'issued' THEN 'not_issued' WHEN (${balanceExpression})=0 THEN 'paid' WHEN i.due_on<current_date THEN 'overdue' WHEN (${balanceExpression})<i.total THEN 'partial' ELSE 'unpaid' END AS payment,0 AS "activeProjects",i.client_id FROM invoices i JOIN clients c ON c.id=i.client_id AND c.organization_id=i.organization_id LEFT JOIN projects p ON p.id=i.project_id AND p.organization_id=i.organization_id WHERE i.organization_id=${org}`;
  return sql`SELECT d.id,d.entity_type||' '||d.channel AS name,'' AS number,'' AS client,'' AS project,d.status,'' AS kind,'' AS division,'' AS currency,'0' AS total,'' AS due,d.created_at AS created,CASE WHEN d.channel='email' THEN d.recipient ELSE '' END AS email,CASE WHEN d.channel='whatsapp' THEN d.recipient ELSE '' END AS phone,d.status AS delivery,'' AS balance,'' AS payment,0 AS "activeProjects" FROM delivery_intents d WHERE d.organization_id=${org}`;
}
export function listQueries(org: string, entity: Entity, q: QueryState) {
  const conditions: SQL[] = [sql`true`];
  if (q.search)
    conditions.push(
      sql`(name ILIKE ${literalSearch(q.search)} OR number ILIKE ${literalSearch(q.search)} OR client ILIKE ${literalSearch(q.search)} OR project ILIKE ${literalSearch(q.search)} OR email ILIKE ${literalSearch(q.search)} OR phone ILIKE ${literalSearch(q.search)}${entity === "clients" ? sql` OR EXISTS(SELECT 1 FROM client_contacts cc WHERE cc.organization_id=${org} AND cc.client_id=b.id AND (cc.email ILIKE ${literalSearch(q.search)} OR cc.phone ILIKE ${literalSearch(q.search)}))` : sql``})`,
    );
  for (const key of [
    "status",
    "currency",
    "division",
    "kind",
    "payment",
  ] as const)
    if (q[key]) conditions.push(sql`${sql.identifier(key)}=${q[key]}`);
  if (q.clientId && entity !== "clients" && entity !== "deliveries")
    conditions.push(sql`client_id=${q.clientId}::uuid`);
  if (q.from) conditions.push(sql`created>=${q.from}::date`);
  if (q.to) conditions.push(sql`created<${q.to}::date+interval '1 day'`);
  const filtered = sql`WITH b AS (${listBase(org, entity)}), filtered AS (SELECT * FROM b WHERE ${sql.join(conditions, sql` AND `)})`;
  const column = [
    "name",
    "number",
    "created",
    "total",
    "due",
    "status",
  ].includes(q.sort)
    ? sql.identifier(q.sort)
    : sql.identifier("created");
  const sort = q.sort === "total" ? sql`${column}::numeric` : column;
  return {
    count: sql`${filtered} SELECT count(*)::int AS count FROM filtered`,
    rows: (page: number) =>
      sql`${filtered} SELECT * FROM filtered ORDER BY ${sort} ${q.desc ? sql`DESC` : sql`ASC`},id ASC LIMIT ${q.size} OFFSET ${(page - 1) * q.size}`,
    summary: sql`${filtered} SELECT currency,sum(total::numeric)::text AS total,sum(coalesce(nullif(balance,''),'0')::numeric)::text AS due FROM filtered WHERE currency<>'' GROUP BY currency`,
  };
}

