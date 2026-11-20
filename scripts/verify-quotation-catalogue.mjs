// Quotation item catalogue on a disposable PGlite database migrated with drizzle-current
// (0000-0014). Real server actions, reads, permission code, decimal calculation and SQL; Clerk is
// a fake organization (including a custom-permission delegation) and nothing leaves the process.
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

process.env.CALACOT_CLERK_ORG_ID = "a";
process.env.CALACOT_APPROVED_TAX_RATE = "18";
process.env.SALES_NOTIFICATION_MODE = "capture";
const pg = new PGlite();
const logo = await readFile("public/calacot-logo.png");
const brand = { template: "calacot-commercial-v1", logo: "calacot-logo.png", logoSha256: "fixture", logoBase64: logo.toString("base64") };
const passed = [];
const check = async (name, fn) => { try { await fn(); } catch (e) { console.error(`FAILED in: ${name}`); throw e; } passed.push(name); };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const e of journal.entries) for (const s of (await readFile(`drizzle-current/${e.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec(`INSERT INTO organizations(id,name,legal_name,email) VALUES('a','A','A Ltd','billing@a.test'),('b','B','B Ltd','billing@b.test');
    INSERT INTO staff_memberships(organization_id,clerk_user_id,display_name,clerk_role,status) VALUES
      ('a','user_admin','Admin','org:admin','active'),('a','user_sales','Sales','org:sales','active'),('a','user_lead','Sales lead','org:sales','active'),
      ('a','user_viewer','Viewer','org:viewer','active'),('a','user_emp','Employee','org:member','active'),('b','user_other','Other admin','org:admin','active');
    INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES('${id(1)}','a','company','Painting client','painting'),('${id(2)}','b','company','Other client','painting');
    INSERT INTO client_contacts(id,organization_id,client_id,name,email) VALUES('${id(3)}','a','${id(1)}','Contact','client@a.test'),('${id(4)}','b','${id(2)}','Contact B','client@b.test');
    INSERT INTO projects(id,organization_id,client_id,code,name,division,currency,status) VALUES
      ('${id(5)}','a','${id(1)}','P-1','House repaint','painting','UGX','planned'),('${id(6)}','a','${id(1)}','P-2','Office repaint','painting','UGX','planned'),
      ('${id(7)}','a','${id(1)}','P-3','Legacy repaint','painting','UGX','planned'),('${id(8)}','b','${id(2)}','P-B','Other','painting','UGX','planned');`);

  const members = {
    a: new Map([["user_admin", ["org:admin", []]], ["user_sales", ["org:sales", []]], ["user_lead", ["org:sales", ["org:calacot:catalogue_manage"]]], ["user_viewer", ["org:viewer", []]], ["user_emp", ["org:member", []]]]),
    b: new Map([["user_other", ["org:admin", []]]]),
  };
  const c = (globalThis.__cat = { db: drizzle(pg), als: new AsyncLocalStorage(), session: { userId: "user_admin", orgId: "a", orgRole: "org:admin" },
    clerk: { organizations: { async getOrganizationMembershipList({ organizationId, userId }) { const m = members[organizationId] ?? new Map(); const data = (userId ?? [...m.keys()]).filter((u) => m.has(u)).map((u) => ({ organization: { id: organizationId }, role: m.get(u)[0], permissions: m.get(u)[1], publicUserData: { userId: u } })); return { data, totalCount: data.length }; } } } });
  const entry = `export { saveCatalogueItem, searchCatalogue } from "./lib/catalogue/actions"; export { readCatalogue } from "./lib/catalogue/reads";
    export { saveQuote } from "./lib/sales/actions"; export { totals } from "./lib/sales/money"; export { renderCommercialPdf } from "./lib/sales/pdf";`;
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
    plugins: [{ name: "isolated", setup(b) {
      b.onResolve({ filter: /^(server-only|next\/cache|next\/headers|next\/navigation|@\/database\/db|@clerk\/nextjs\/server)$/ }, ({ path }) => ({ path, namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => {
        const g = "const c=globalThis.__cat;";
        if (path === "server-only") return { loader: "js", contents: "" };
        if (path === "next/cache") return { loader: "js", contents: "export function revalidatePath(){}" };
        if (path === "next/headers") return { loader: "js", contents: "export async function headers(){return new Headers({host:'app.test',origin:'http://app.test'})}" };
        if (path === "next/navigation") return { loader: "js", contents: "export function notFound(){throw new Error('NEXT_NOT_FOUND')} export function redirect(u){throw new Error('REDIRECT:'+u)}" };
        if (path === "@clerk/nextjs/server") return { loader: "js", contents: g + "export async function auth(){const s=c.session;return {...s,orgSlug:'calacot',has(){return false},redirectToSignIn(){throw new Error('signin')}}} export async function clerkClient(){return c.clerk} export async function currentUser(){return null}" };
        return { loader: "js", contents: g + "export const db={execute(q){return c.db.execute(q)}}" };
      });
    } }] });
  await mkdir("tmp", { recursive: true });
  const file = resolve("tmp/quotation-catalogue.cjs");
  await writeFile(file, bundle.outputFiles[0].contents);
  const m = createRequire(import.meta.url)(file);
  const as = (userId, orgId = "a") => { c.session = { userId, orgId, orgRole: members[orgId].get(userId)[0] }; };
  const q = async (t, p = []) => (await pg.query(t, p)).rows;
  const denied = async (p) => { await assert.rejects(p, /NEXT_NOT_FOUND/); };
  const item = (o = {}) => ({ name: "Emulsion paint (interior)", division: "painting", category: "Interior paint", itemType: "material", description: "Premium washable emulsion, two coats", unit: "m²", unitPrice: "8500.00", currency: "UGX", ...o });
  const quote = (o = {}) => ({ revision: 0, clientId: id(1), projectId: id(5), contactId: id(3), title: "House repaint", division: "painting", currency: "UGX", scope: "Interior repaint", deliverables: [], exclusions: [], terms: "50% on start", validUntil: new Date(Date.now() + 7 * 864e5).toISOString(), ...o });
  const withSchedule = (qq) => { const t = m.totals(qq.items, "18").total; return { ...qq, schedules: [{ label: "Full amount", amount: t, dueAt: "" }] }; };
  const lines = async (qid) => q("SELECT i.position,i.item_name,i.unit,i.quantity::text,i.unit_price::text,i.catalogue_unit_price::text,i.price_source,i.service_id,i.subtotal::text,i.tax_amount::text,i.total::text FROM quotation_items i JOIN quotation_versions v ON v.id=i.quotation_version_id WHERE v.quotation_id=$1 AND v.version=(SELECT max(version) FROM quotation_versions WHERE quotation_id=$1) ORDER BY i.position", [qid]);
  const draft = async (qid) => (await q("SELECT id,revision FROM quotation_versions WHERE quotation_id=$1 ORDER BY version DESC LIMIT 1", [qid]))[0];

  let paint, labour, prep;
  await check("catalogue creation and editing (decimal prices, audit, optimistic version, validation)", async () => {
    as("user_admin");
    const r = await m.saveCatalogueItem(item());
    assert.equal(r.ok, true, r.message); paint = r.item;
    assert.equal(paint.unit_price, "8500.00"); assert.match(paint.code, /^CAT-PAI-\d{5}$/); assert.equal(paint.row_version, 1);
    labour = (await m.saveCatalogueItem(item({ name: "Painter labour", itemType: "labour", category: "Labour", unit: "day", unitPrice: "60000", description: "One skilled painter, one day" }))).item;
    prep = (await m.saveCatalogueItem(item({ name: "Surface preparation", itemType: "service", category: "Preparation", unit: "m²", unitPrice: "1500.50", description: "Sanding, filling and priming" }))).item;
    const e = await m.saveCatalogueItem({ ...item({ unitPrice: "9000" }), id: paint.id, rowVersion: 1 });
    assert.equal(e.ok, true, e.message); assert.equal(e.item.unit_price, "9000.00"); assert.equal(e.item.row_version, 2);
    const audit = await q("SELECT action,changes FROM audit_logs WHERE entity_type='catalogue_item' AND entity_id=$1 ORDER BY created_at", [paint.id]);
    assert.deepEqual(audit.map((a) => a.action), ["catalogue.create", "catalogue.price_change"]);
    assert.deepEqual(audit[1].changes.default_unit_price, { from: 8500, to: 9000 });
    for (const bad of [{ unitPrice: "1.234" }, { unitPrice: "-5" }, { unitPrice: "1e3" }, { name: "" }, { unit: "" }, { itemType: "paint" }, { division: "mars" }, { currency: "EUR" }])
      assert.equal((await m.saveCatalogueItem(item(bad))).ok, false, JSON.stringify(bad));
    const dup = await m.saveCatalogueItem(item({ name: "EMULSION PAINT (INTERIOR)" }));
    assert.equal(dup.ok, false); assert.match(dup.message, /already exists/);
    // The database rejects invalid values even if application validation were bypassed.
    await assert.rejects(q("SELECT catalogue_item_save('a','user_admin',$1::jsonb,'t')", [JSON.stringify(item({ name: "X", unitPrice: "12.345" }))]), /catalogue_invalid/);
  });

  await check("concurrent catalogue edits: a stale row version is refused, not silently overwritten", async () => {
    as("user_admin");
    const cur = (await q("SELECT row_version FROM services WHERE id=$1", [labour.id]))[0].row_version;
    assert.equal((await m.saveCatalogueItem({ ...item({ name: "Painter labour", itemType: "labour", category: "Labour", description: "One skilled painter, one day", unit: "day", unitPrice: "65000" }), id: labour.id, rowVersion: cur })).ok, true);
    const stale = await m.saveCatalogueItem({ ...item({ name: "Painter labour", itemType: "labour", category: "Labour", description: "One skilled painter, one day", unit: "day", unitPrice: "70000" }), id: labour.id, rowVersion: cur });
    assert.equal(stale.ok, false); assert.match(stale.message, /changed by someone else/);
    assert.equal((await q("SELECT default_unit_price::text p FROM services WHERE id=$1", [labour.id]))[0].p, "65000.00");
    labour = { ...labour, unit_price: "65000.00" };
  });

  await check("search and filtering (text, division default, type, category, status)", async () => {
    as("user_sales");
    let r = await m.readCatalogue({});
    assert.equal(r.filters.division, "painting"); assert.equal(r.total, 3); assert.equal(r.canManage, false);
    r = await m.readCatalogue({ q: "sand" }); assert.deepEqual(r.rows.map((x) => x.name), ["Surface preparation"]);
    r = await m.readCatalogue({ type: "labour" }); assert.deepEqual(r.rows.map((x) => x.name), ["Painter labour"]);
    r = await m.readCatalogue({ category: "Interior paint" }); assert.equal(r.rows.length, 1);
    r = await m.readCatalogue({ q: "100%_" }); assert.equal(r.total, 0, "wildcards are literal");
    r = await m.readCatalogue({ division: "tech" }); assert.equal(r.total, 0);
    assert.deepEqual(r.categories, ["Interior paint", "Labour", "Preparation"]);
    const picker = await m.searchCatalogue("painting", "UGX", "paint");
    assert.deepEqual(picker.map((x) => x.name).sort(), ["Emulsion paint (interior)", "Painter labour"]);
    assert.equal((await m.searchCatalogue("painting", "USD", "")).length, 0, "currency must match");
  });

  let q1;
  await check("item selection, quantity entry and decimal-safe line totals; custom lines", async () => {
    as("user_sales");
    const items = [
      { catalogueItemId: paint.id, description: "Living room walls", unit: "m²", quantity: "42.5", unitPrice: "9000.00", discountAmount: "0", taxRate: "18" },
      { catalogueItemId: prep.id, description: "Prep", unit: "m²", quantity: "42.5", unitPrice: "1500.50", discountAmount: "0", taxRate: "18" },
      { catalogueItemId: "", name: "Scaffold hire", itemType: "service", description: "Mobile scaffold, 3 days", unit: "lump sum", quantity: "1", unitPrice: "150000", discountAmount: "10000", taxRate: "18" },
    ];
    const r = await m.saveQuote(withSchedule(quote({ items })));
    assert.equal(r.ok, true, r.error); q1 = r.value;
    const l = await lines(q1);
    assert.deepEqual(l.map((x) => x.price_source), ["catalogue", "catalogue", "custom"]);
    assert.equal(l[0].item_name, "Emulsion paint (interior)"); assert.equal(l[0].catalogue_unit_price, "9000.00");
    // 42.5 x 9000.00 = 382500.00; 18% tax = 68850.00. 42.5 x 1500.50 = 63771.25 -> tax 11478.83 (rounded half up).
    assert.deepEqual([l[0].subtotal, l[0].tax_amount, l[0].total], ["382500.00", "68850.00", "451350.00"]);
    assert.deepEqual([l[1].subtotal, l[1].tax_amount, l[1].total], ["63771.25", "11478.83", "75250.08"]);
    assert.deepEqual([l[2].subtotal, l[2].tax_amount, l[2].total, l[2].item_name, l[2].service_id], ["150000.00", "25200.00", "165200.00", "Scaffold hire", null]);
    const v = (await q("SELECT subtotal::text,tax_amount::text,total::text FROM quotation_versions WHERE quotation_id=$1", [q1]))[0];
    assert.deepEqual(v, { subtotal: "596271.25", tax_amount: "105528.83", total: "691800.08" });
    // Reordering and removal: the saved positions follow the submitted order.
    const d = await draft(q1);
    const reordered = [items[2], items[0]];
    assert.equal((await m.saveQuote(withSchedule(quote({ id: q1, revision: d.revision, items: reordered })))).ok, true);
    assert.deepEqual((await lines(q1)).map((x) => x.item_name), ["Scaffold hire", "Emulsion paint (interior)"]);
  });

  await check("manual price overrides follow the permission policy and are recorded", async () => {
    as("user_sales");
    let d = await draft(q1);
    const over = [{ catalogueItemId: paint.id, description: "Walls", unit: "m²", quantity: "10", unitPrice: "8000", discountAmount: "0", taxRate: "18" }];
    let r = await m.saveQuote(withSchedule(quote({ id: q1, revision: d.revision, items: over })));
    assert.equal(r.ok, false); assert.match(r.error, /not permitted to change catalogue prices/);
    // A forged client flag cannot grant the override.
    r = await m.saveQuote({ ...withSchedule(quote({ id: q1, revision: d.revision, items: over })), allowPriceOverride: true });
    assert.equal(r.ok, false);
    // A catalogue line's unit is fixed (price per unit would otherwise be misapplied).
    r = await m.saveQuote(withSchedule(quote({ id: q1, revision: d.revision, items: [{ ...over[0], unit: "litre", unitPrice: "9000" }] })));
    assert.equal(r.ok, false); assert.match(r.error, /unit cannot be changed/);
    as("user_admin");
    r = await m.saveQuote(withSchedule(quote({ id: q1, revision: d.revision, items: over })));
    assert.equal(r.ok, true, r.error);
    const l = await lines(q1);
    assert.deepEqual([l[0].price_source, l[0].unit_price, l[0].catalogue_unit_price], ["override", "8000.00", "9000.00"]);
    const audit = (await q("SELECT changes FROM audit_logs WHERE action='quotation.save' AND entity_id=$1 ORDER BY created_at DESC LIMIT 1", [q1]))[0].changes;
    assert.equal(audit.priceOverrides[0].cataloguePrice, "9000.00"); assert.equal(audit.priceOverrides[0].unitPrice, "8000.00");
    // The database enforces consistency even for direct writes.
    await assert.rejects(q("UPDATE quotation_items SET price_source='catalogue' WHERE price_source='override'"), /quotation_items_price_source_check/);
  });

  await check("inactive items cannot be newly selected; a draft already using one can still be saved", async () => {
    as("user_admin");
    const cur = (await q("SELECT row_version FROM services WHERE id=$1", [prep.id]))[0].row_version;
    assert.equal((await m.saveCatalogueItem({ ...item({ name: "Surface preparation", itemType: "service", category: "Preparation", description: "Sanding, filling and priming", unit: "m²", unitPrice: "1500.50" }), id: prep.id, rowVersion: cur, isActive: false })).ok, true);
    assert.equal((await q("SELECT action FROM audit_logs WHERE entity_id=$1 ORDER BY created_at DESC LIMIT 1", [prep.id]))[0].action, "catalogue.deactivate");
    as("user_sales");
    assert.equal((await m.searchCatalogue("painting", "UGX", "prep")).length, 0);
    const line = { catalogueItemId: prep.id, description: "Prep", unit: "m²", quantity: "5", unitPrice: "1500.50", discountAmount: "0", taxRate: "18" };
    const r = await m.saveQuote(withSchedule(quote({ projectId: id(6), title: "Office", items: [line] })));
    assert.equal(r.ok, false); assert.match(r.error, /deactivated/);
    // Draft created while active, then the item is deactivated: re-saving keeps it.
    as("user_admin");
    const r2 = await m.saveCatalogueItem({ ...item({ name: "Surface preparation", itemType: "service", category: "Preparation", description: "Sanding, filling and priming", unit: "m²", unitPrice: "1500.50" }), id: prep.id, rowVersion: cur + 1, isActive: true });
    assert.equal(r2.ok, true, r2.message);
    as("user_sales");
    const q2 = (await m.saveQuote(withSchedule(quote({ projectId: id(6), title: "Office", items: [line] })))).value;
    as("user_admin");
    assert.equal((await m.saveCatalogueItem({ ...item({ name: "Surface preparation", itemType: "service", category: "Preparation", description: "Sanding, filling and priming", unit: "m²", unitPrice: "1500.50" }), id: prep.id, rowVersion: cur + 2, isActive: false })).ok, true);
    as("user_sales");
    const d = await draft(q2);
    const r3 = await m.saveQuote(withSchedule(quote({ id: q2, revision: d.revision, projectId: id(6), title: "Office", items: [line] })));
    assert.equal(r3.ok, true, r3.error);
  });

  await check("historical integrity: issued snapshot, catalogue price changes, revision and invoice", async () => {
    as("user_admin");
    let d = await draft(q1);
    const items = [{ catalogueItemId: paint.id, description: "Walls", unit: "m²", quantity: "10", unitPrice: "9000.00", discountAmount: "0", taxRate: "18" },
      { catalogueItemId: "", name: "", itemType: "", description: "Legacy-style line", unit: "item", quantity: "1", unitPrice: "1000", discountAmount: "0", taxRate: "18" }];
    assert.equal((await m.saveQuote(withSchedule(quote({ id: q1, revision: d.revision, items })))).ok, true);
    d = await draft(q1);
    const cfg = JSON.stringify({ policy: "full", taxRate: "18", dueDays: 14, from: "billing@a.test", replyTo: "billing@a.test", instructions: "", brand, templateApproved: false });
    const command = (vid, rev, cmd, p = {}) => q("SELECT sales_quote_command('a','user_admin',$1::uuid,$2::uuid,$3,$4,$5::jsonb,$6::jsonb,'t') AS r", [q1, vid, rev, cmd, JSON.stringify(p), cfg]);
    await command(d.id, d.revision, "send");
    const snap = (await q("SELECT document_snapshot FROM quotation_versions WHERE id=$1", [d.id]))[0].document_snapshot;
    assert.equal(snap.items[0].name, "Emulsion paint (interior)"); assert.equal(snap.items[0].priceSource, "catalogue"); assert.equal(snap.items[0].unitPrice, "9000.00");
    assert.equal(snap.items[1].name, undefined, "no name key for an unnamed custom line"); assert.equal(snap.items[1].priceSource, "custom");
    const before = JSON.stringify(await lines(q1));
    // Catalogue price change after issue: nothing issued changes.
    let cur = (await q("SELECT row_version FROM services WHERE id=$1", [paint.id]))[0].row_version;
    assert.equal((await m.saveCatalogueItem({ ...item({ unitPrice: "9900" }), id: paint.id, rowVersion: cur })).ok, true);
    assert.equal(JSON.stringify(await lines(q1)), before);
    assert.deepEqual((await q("SELECT document_snapshot FROM quotation_versions WHERE id=$1", [d.id]))[0].document_snapshot, snap);
    await assert.rejects(q("UPDATE quotation_items SET unit_price=1 WHERE quotation_version_id=$1", [d.id]));
    // PDF from the issued snapshot shows the item name.
    const pdf = await m.renderCommercialPdf(snap, false);
    assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), "%PDF-");
    // Revise: the new draft keeps the issued prices as catalogue prices (no false override).
    await command(d.id, null, "revise");
    let nd = await draft(q1);
    let l = await lines(q1);
    assert.deepEqual([l[0].price_source, l[0].unit_price, l[0].catalogue_unit_price], ["catalogue", "9000.00", "9000.00"]);
    as("user_sales");
    const kept = await m.saveQuote(withSchedule(quote({ id: q1, revision: nd.revision, items })));
    assert.equal(kept.ok, true, kept.error);
    assert.equal((await lines(q1))[0].price_source, "catalogue", "grandfathered price is not an override");
    // Updating to the current catalogue price is also a catalogue price (no override permission needed).
    nd = await draft(q1);
    const fresh = await m.saveQuote(withSchedule(quote({ id: q1, revision: nd.revision, items: [{ ...items[0], unitPrice: "9900.00" }, items[1]] })));
    assert.equal(fresh.ok, true, fresh.error);
    l = await lines(q1); assert.deepEqual([l[0].price_source, l[0].catalogue_unit_price], ["catalogue", "9900.00"]);
    // Send and confirm the revision: the invoice copies the quotation lines and totals exactly.
    as("user_admin");
    nd = await draft(q1);
    await command(nd.id, nd.revision, "send");
    const res = (await q("SELECT sales_quote_command('a','user_admin',$1::uuid,$2::uuid,NULL,'confirm',$3::jsonb,$4::jsonb,'t') AS r", [q1, nd.id, JSON.stringify({ acceptedBy: "Client", acceptedAt: new Date().toISOString(), source: "email", evidence: "Signed" }), cfg]))[0].r;
    const inv = (await q("SELECT subtotal::text,tax_amount::text,total::text,(SELECT json_agg(unit_price::text ORDER BY position) FROM invoice_items WHERE invoice_id=$1) prices FROM invoices WHERE id=$1", [res.invoiceId]))[0];
    const v = (await q("SELECT subtotal::text,tax_amount::text,total::text FROM quotation_versions WHERE id=$1", [nd.id]))[0];
    assert.deepEqual({ subtotal: inv.subtotal, tax_amount: inv.tax_amount, total: inv.total }, v);
    assert.deepEqual(inv.prices, ["9900.00", "1000.00"]);
    // The first issued version is still exactly as issued.
    assert.equal((await q("SELECT document_snapshot->'items'->0->>'unitPrice' p FROM quotation_versions WHERE id=$1", [d.id]))[0].p, "9000.00");
  });

  await check("older quotations without catalogue references keep working", async () => {
    // A pre-catalogue line (null snapshot fields) inserted as the old function did.
    const old = id(90), ov = id(91);
    await pg.exec(`INSERT INTO quotations(id,organization_id,client_id,project_id,title,division) VALUES('${old}','a','${id(1)}','${id(7)}','Legacy','painting');
      INSERT INTO quotation_versions(id,organization_id,quotation_id,version,customer_snapshot,issuer_snapshot,scope,terms,currency,subtotal,tax_amount,total,delivery_contact_id,valid_until) VALUES('${ov}','a','${old}',1,'{}','{}','Old scope','Old terms','UGX',100,18,118,'${id(3)}',now()+interval '5 days');
      INSERT INTO quotation_items(organization_id,quotation_version_id,position,description,unit,quantity,unit_price,tax_rate,subtotal,tax_amount,total) VALUES('a','${ov}',0,'Old line','item',1,100,18,100,18,118);
      INSERT INTO quotation_payment_schedules(organization_id,quotation_version_id,position,label,amount) VALUES('a','${ov}',0,'Full',118);`);
    assert.equal((await lines(old))[0].price_source, null);
    as("user_sales");
    const r = await m.saveQuote(withSchedule(quote({ id: old, revision: 0, projectId: id(7), title: "Legacy", items: [{ description: "Old line", unit: "item", quantity: "1", unitPrice: "100", discountAmount: "0", taxRate: "18" }] })));
    assert.equal(r.ok, true, r.error);
    assert.equal((await lines(old))[0].price_source, "custom");
    const pdf = await m.renderCommercialPdf({ type: "quotation", number: "Q-1", version: 1, title: "Legacy", project: "Legacy", currency: "UGX", customer: { name: "C", email: "c@a.test", address: "", taxIdentifier: "" }, issuer: { legalName: "A Ltd", address: "", email: "", phone: "", taxIdentifier: "" }, scope: "s", deliverables: [], exclusions: [], terms: "t", instructions: "", items: [{ description: "Old line", unit: "item", quantity: "1", unitPrice: "100.00", discountAmount: "0.00", taxRate: "18.00", position: 0, subtotal: "100.00", taxAmount: "18.00", total: "118.00" }], subtotal: "100.00", discountAmount: "0.00", taxAmount: "18.00", total: "118.00", schedules: [], issuedAt: new Date().toISOString(), due: "", brand }, false);
    assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), "%PDF-");
  });

  await check("unauthorized access: sales/viewer/employee cannot manage; Clerk custom permission delegates", async () => {
    for (const u of ["user_sales", "user_viewer"]) { as(u); await denied(m.saveCatalogueItem(item({ name: "Nope " + u }))); }
    as("user_emp"); await denied(m.readCatalogue({})); await denied(m.searchCatalogue("painting", "UGX", ""));
    as("user_viewer"); assert.equal((await m.readCatalogue({})).canManage, false);
    as("user_lead");
    const r = await m.saveCatalogueItem(item({ name: "Gloss enamel", category: "Exterior paint", unitPrice: "12000" }));
    assert.equal(r.ok, true, r.message);
    assert.equal((await q("SELECT count(*)::int n FROM services WHERE name LIKE 'Nope%'"))[0].n, 0);
  });

  await check("cross-organization denial", async () => {
    as("user_other", "b");
    // Layer 1: this deployment is pinned to organization A; another organization's session is refused.
    await denied(m.readCatalogue({})); await denied(m.searchCatalogue("painting", "UGX", ""));
    await assert.rejects(m.saveCatalogueItem(item()), /NEXT_NOT_FOUND/);
    // Layer 2: a deployment configured for organization B still cannot see or use A's items.
    process.env.CALACOT_CLERK_ORG_ID = "b";
    assert.equal((await m.readCatalogue({})).total, 0);
    assert.equal((await m.searchCatalogue("painting", "UGX", "")).length, 0);
    const edit = await m.saveCatalogueItem({ ...item(), id: paint.id, rowVersion: 1 });
    assert.equal(edit.ok, false); assert.match(edit.message, /unavailable/);
    const r = await m.saveQuote(withSchedule(quote({ clientId: id(2), projectId: id(8), contactId: id(4), items: [{ catalogueItemId: paint.id, description: "x", unit: "m²", quantity: "1", unitPrice: "9900.00", discountAmount: "0", taxRate: "18" }] })));
    assert.equal(r.ok, false); assert.match(r.error, /unavailable/);
    // Org b's own catalogue is independent: the same name is allowed there.
    assert.equal((await m.saveCatalogueItem(item())).ok, true);
    assert.equal((await q("SELECT count(*)::int n FROM services WHERE organization_id='a' AND updated_by_clerk_user_id='user_other'"))[0].n, 0);
    process.env.CALACOT_CLERK_ORG_ID = "a";
  });

  console.log(`PASS (${passed.length} groups):\n- ${passed.join("\n- ")}`);
} finally {
  await pg.close();
  delete globalThis.__cat;
}
