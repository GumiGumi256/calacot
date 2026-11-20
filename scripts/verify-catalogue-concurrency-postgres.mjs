// Quotation item catalogue with two independent PostgreSQL connections whose transactions overlap.
// Usage: echo "<url>" | node scripts/verify-catalogue-concurrency-postgres.mjs
// Refuses any database not named quotation_catalogue_fixture; migrates only an empty database.
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

let input = ""; for await (const chunk of process.stdin) input += chunk;
const url = new URL(input.trim());
if (url.pathname !== "/quotation_catalogue_fixture") throw Error("Refusing non-fixture database");
const a = new Client({ connectionString: url.toString() }), b = new Client({ connectionString: url.toString() });
await a.connect(); await b.connect();
const settle = (p) => { const s = { done: false }; s.result = p.then((v) => { s.done = true; return v; }, (e) => { s.done = true; return e; }); return s; };
const pause = () => new Promise((r) => setTimeout(r, 700));
const passed = [];
try {
  if (!(await a.query("SELECT 1 FROM information_schema.columns WHERE table_name='quotation_items' AND column_name='price_source'")).rowCount) {
    if ((await a.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n) throw Error("Fixture not empty; refusing");
    const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
    await a.query("BEGIN");
    try { for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await a.query(s); await a.query("COMMIT"); } catch (e) { await a.query("ROLLBACK"); throw e; }
    passed.push(`migration chain 0000-${journal.entries.at(-1).tag} applied in one transaction`);
  }
  const org = "cat-" + randomUUID(), client = randomUUID(), contact = randomUUID();
  await a.query("INSERT INTO organizations(id,name,legal_name) VALUES($1,'C','C Ltd')", [org]);
  await a.query("INSERT INTO staff_memberships(organization_id,clerk_user_id,status) VALUES($1,'adm','active')", [org]);
  await a.query("INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES($1,$2,'company','C','painting')", [client, org]);
  await a.query("INSERT INTO client_contacts(id,organization_id,client_id,name,email) VALUES($1,$2,$3,'K','k@c.test')", [contact, org, client]);
  const save = (c, p) => c.query("SELECT catalogue_item_save($1,'adm',$2::jsonb,'t') AS r", [org, JSON.stringify({ division: "painting", itemType: "material", unit: "m²", currency: "UGX", category: "Paint", ...p })]);
  const item = (await save(a, { name: "Emulsion", unitPrice: "8500" })).rows[0].r;
  const project = async () => { const id = randomUUID(); await a.query("INSERT INTO projects(id,organization_id,client_id,code,name,division,currency,status) VALUES($1,$2,$3,$4,'P','painting','UGX','planned')", [id, org, client, "P-" + id.slice(0, 8)]); return id; };
  const quote = async (c, price, pid) => {
    const sub = (10 * Number(price)).toFixed(2);
    return c.query("SELECT sales_quote_save($1,'adm',$2::jsonb,'t') AS id", [org, JSON.stringify({ clientId: client, projectId: pid, contactId: contact, title: "Q", division: "painting", currency: "UGX", scope: "s", deliverables: [], exclusions: [], terms: "t", validUntil: new Date(Date.now() + 864e5).toISOString(),
      items: [{ catalogueItemId: item.id, description: "Walls", unit: "m²", quantity: "10", unitPrice: price, discountAmount: "0", taxRate: "0", subtotal: sub, taxAmount: "0", total: sub }], schedules: [{ label: "Full", amount: sub, dueAt: "" }] })]);
  };
  const overlap = async (name, first, second, check) => {
    await a.query("BEGIN"); await b.query("BEGIN");
    await first(a);
    const s = settle(second(b));
    await pause(); assert.equal(s.done, false, `${name}: second transaction must wait`);
    await a.query("COMMIT");
    const r = await s.result; await b.query(r instanceof Error ? "ROLLBACK" : "COMMIT");
    await check(r); passed.push(name);
  };
  const version = async () => (await a.query("SELECT row_version v FROM services WHERE id=$1", [item.id])).rows[0].v;

  let v = await version();
  await overlap("two administrators editing the same item version: second waits, then conflicts", (c) => save(c, { id: item.id, rowVersion: v, name: "Emulsion", unitPrice: "9000" }), (c) => save(c, { id: item.id, rowVersion: v, name: "Emulsion", unitPrice: "9500" }), async (r) => {
    assert.match(String(r), /catalogue_conflict/);
    assert.equal((await a.query("SELECT default_unit_price::text p FROM services WHERE id=$1", [item.id])).rows[0].p, "9000.00");
  });

  let p1 = await project();
  v = await version();
  await overlap("quotation saved at the catalogue price while the price changes: the price change waits; the quotation keeps its snapshot", (c) => quote(c, "9000", p1), (c) => save(c, { id: item.id, rowVersion: v, name: "Emulsion", unitPrice: "9900" }), async (r) => {
    assert(!(r instanceof Error), String(r));
    const l = (await a.query("SELECT unit_price::text u,catalogue_unit_price::text c,price_source s FROM quotation_items i JOIN quotation_versions qv ON qv.id=i.quotation_version_id JOIN quotations q ON q.id=qv.quotation_id WHERE q.project_id=$1", [p1])).rows[0];
    assert.deepEqual(l, { u: "9000.00", c: "9000.00", s: "catalogue" });
  });

  const p2 = await project();
  v = await version();
  await overlap("price change committed first: a quotation still using the old price (no override permission) waits, then is refused", (c) => save(c, { id: item.id, rowVersion: v, name: "Emulsion", unitPrice: "10500" }), (c) => quote(c, "9900", p2), async (r) => {
    assert.match(String(r), /price_override_not_permitted/);
  });

  const p3 = await project();
  v = await version();
  await overlap("deactivation racing a new selection: the selection waits and is refused", (c) => save(c, { id: item.id, rowVersion: v, name: "Emulsion", unitPrice: "10500", isActive: false }), (c) => quote(c, "10500", p3), async (r) => {
    assert.match(String(r), /catalogue_item_inactive/);
  });

  await overlap("the same new item created twice concurrently: exactly one active item", (c) => save(c, { name: "Gloss", unitPrice: "12000" }), (c) => save(c, { name: "gloss", unitPrice: "12500" }), async (r) => {
    assert.match(String(r), /services_active_item_uq/);
    assert.equal((await a.query("SELECT count(*)::int n FROM services WHERE organization_id=$1 AND lower(name)='gloss'", [org])).rows[0].n, 1);
  });
  console.log(`PASS on ${(await a.query("SELECT version()")).rows[0].version.split(" ").slice(0, 2).join(" ")} (${passed.length}):\n- ${passed.join("\n- ")}`);
} finally { await a.end(); await b.end(); }
