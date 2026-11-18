import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { canReadMetric, dashboardQuery } from "../lib/admin/dashboard-queries";
import { navigation, visibleNavigation } from "../lib/admin/navigation";

async function main() {
  const viewer = { organizationId: "a", role: "org:viewer", permissions: ["projects_read", "invoices_read"] as const };
  assert.equal(canReadMetric(viewer, "projects"), true);
  assert.equal(canReadMetric(viewer, "payments"), false);
  assert.equal(canReadMetric(viewer, "enquiries"), false);
  assert.equal(canReadMetric(viewer, "designReviews"), false);
  assert.equal(canReadMetric(viewer, "overdueInvoices"), true);
  assert.equal(canReadMetric({ ...viewer, role: "org:admin" }, "enquiries"), true);
  const visible = visibleNavigation(viewer.role, viewer.permissions);
  assert(!visible.some(item => item.adminOnly || item.name === "Payments"));
  assert(visible.some(item => item.name === "Projects"));
  assert.equal(new Set(navigation.map(item => item.url)).size, navigation.length);
  for (const item of navigation) await access(`app/(admin)${item.url}/page.tsx`);

  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE payments(id text, organization_id text, currency text, amount numeric, status text);
    CREATE TABLE invoices(id text, organization_id text, currency text, total numeric, status text, due_on date);
    CREATE TABLE payment_allocations(id text, organization_id text, invoice_id text, payment_id text, amount numeric);
    CREATE TABLE credit_notes(organization_id text, invoice_id text, status text, total numeric);
    CREATE TABLE payment_refunds(id text, organization_id text, status text);
    CREATE TABLE payment_allocation_reversals(organization_id text, allocation_id text, refund_id text, amount numeric);
    CREATE TABLE projects(organization_id text, status text, archived_at timestamptz);
    CREATE TABLE quotations(id text, organization_id text);
    CREATE TABLE quotation_versions(quotation_id text, organization_id text, version int, status text, valid_until timestamptz);
    CREATE TABLE leads(organization_id text, status text); CREATE TABLE care_requests(status text); CREATE TABLE design_purchases(purchase_status text);
    INSERT INTO payments VALUES ('p','a','UGX',100,'confirmed'),('p2','a','USD',20,'confirmed'),('p3','a','UGX',30,'submitted'),('p4','b','UGX',900,'confirmed');
    INSERT INTO invoices VALUES ('i','a','UGX',200,'issued',current_date-1),('j','a','USD',40,'issued',current_date+1),('k','a','UGX',999,'void',current_date-1),('l','b','UGX',500,'issued',current_date-1),('paid','a','USD',0,'issued',current_date-1);
    INSERT INTO payment_allocations VALUES ('alloc','a','i','p',100);
    INSERT INTO credit_notes VALUES ('a','i','issued',20);
    INSERT INTO payment_refunds VALUES ('r','a','completed');
    INSERT INTO payment_allocation_reversals VALUES ('a','alloc','r',10);
    INSERT INTO projects VALUES ('a','active',NULL),('a','active',now()),('b','active',NULL),('a','planned',NULL);
    INSERT INTO quotations VALUES ('q','a'),('q2','a'),('q3','b');
    INSERT INTO quotation_versions VALUES ('q','a',1,'sent',now()+interval '1 day'),('q','a',2,'draft',now()+interval '1 day'),('q2','a',1,'sent',now()+interval '1 day'),('q3','b',1,'sent',now()+interval '1 day');
    INSERT INTO leads VALUES ('a','new'),('a','contacted'),('b','new'); INSERT INTO care_requests VALUES ('new'),('closed');
    INSERT INTO design_purchases VALUES ('payment_submitted'),('completed');
  `);
  const db = drizzle(pg);
  const rows = async (metric: Parameters<typeof dashboardQuery>[1]) => (await db.execute(dashboardQuery("a", metric))).rows;
  assert.deepEqual(await rows("payments"), [{ currency: "UGX", amount: "100" }, { currency: "USD", amount: "20" }]);
  assert.deepEqual(await rows("outstanding"), [{ currency: "UGX", amount: "90" }, { currency: "USD", amount: "40" }]);
  for (const metric of ["projects", "quotations", "leads", "enquiries"] as const) assert.equal((await rows(metric))[0].count, 1);
  assert.equal((await rows("overdueInvoices"))[0].count, 1);
  assert.equal((await rows("designReviews"))[0].count, 1);
  await pg.close();
  console.log("PASS: scoped dashboard aggregates, ledger adjustments, currency separation, statuses, permission policy and sidebar routes.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
