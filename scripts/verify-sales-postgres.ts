/** Explicit isolated target only. Leaves uniquely named fixtures for inspection. No providers. */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { totals } from "../lib/sales/money";

async function main() {
  const url = process.env.SALES_TEST_DATABASE_URL;
  if (!url || process.env.SALES_TEST_DATABASE_APPROVED !== "true") {
    throw new Error("Set SALES_TEST_DATABASE_URL to a migrated isolated test database and SALES_TEST_DATABASE_APPROVED=true. Default DATABASE_URL is never used.");
  }
  const query = neon(url).query;
  const org = `sales_test_${randomUUID()}`, actor = `test_${randomUUID()}`;
  await query("INSERT INTO organizations(id,name,legal_name,email) VALUES($1,'Sales test','Sales Test Ltd','billing@example.test')", [org]);
  await query("INSERT INTO staff_memberships(organization_id,clerk_user_id) VALUES($1,$2)", [org, actor]);
  const client = (await query("SELECT sales_client($1,$2,$3::jsonb,$4) AS id", [org,actor,JSON.stringify({kind:"company",department:"architecture",displayName:"Isolated sales test",billingAddress:{},contacts:[{name:"Test contact",email:"client@example.test",phone:"+256700000000",isPrimary:true}]}),randomUUID()]))[0].id;
  const contact = (await query("SELECT id FROM client_contacts WHERE organization_id=$1 AND client_id=$2", [org,client]))[0].id;
  const project = (await query("SELECT sales_project($1,$2,$3::jsonb,$4) AS id", [org,actor,JSON.stringify({clientId:client,name:"Concurrency fixture",division:"architecture",currency:"UGX",scope:"Test only",startsOn:"",dueOn:""}),randomUUID()]))[0].id;
  const money = totals([{description:"Test service",quantity:"1",unit:"item",unitPrice:"200",discountAmount:"0",taxRate:"0"}],"0");
  const quote = (await query("SELECT sales_quote_save($1,$2,$3::jsonb,$4) AS id", [org,actor,JSON.stringify({...money,clientId:client,projectId:project,contactId:contact,title:"Concurrency fixture",division:"architecture",currency:"UGX",scope:"Test only",deliverables:[],exclusions:[],terms:"Test",validUntil:new Date(Date.now()+86400000).toISOString(),schedules:[{label:"Full",amount:"200",dueAt:""}]}),randomUUID()]))[0].id;
  const version = (await query("SELECT id,revision FROM quotation_versions WHERE organization_id=$1 AND quotation_id=$2", [org,quote]))[0];
  const cfg = JSON.stringify({policy:"full",taxRate:"0",dueDays:14,from:"billing@example.test",replyTo:"billing@example.test",instructions:"",brand:{template:"test-v1"},templateApproved:false});
  const command = (cmd:string, payload:unknown) => query("SELECT sales_quote_command($1,$2,$3::uuid,$4::uuid,$5,$6,$7::jsonb,$8::jsonb,$9) AS result", [org,actor,quote,version.id,version.revision,cmd,JSON.stringify(payload),cfg,randomUUID()]);
  await command("send",{});
  const acceptance = {acceptedBy:"Verified fixture contact",acceptedAt:new Date().toISOString(),source:"email",evidence:"Isolated concurrency test evidence"};
  // Each HTTP query executes independently on PostgreSQL, rather than on a serialized local connection.
  const results = await Promise.all(Array.from({length:8},()=>command("confirm",acceptance)));
  assert.equal(new Set(results.map(r=>r[0].result.invoiceId)).size,1);
  const counts = (await query("SELECT (SELECT count(*)::int FROM invoices WHERE organization_id=$1) AS invoices,(SELECT count(*)::int FROM delivery_intents WHERE organization_id=$1) AS intents,(SELECT count(*)::int FROM payments WHERE organization_id=$1) AS payments",[org]))[0];
  assert.deepEqual(counts,{invoices:1,intents:3,payments:0});
  const edits = await Promise.allSettled(Array.from({length:4},()=>query("UPDATE quotation_items SET unit_price=1 WHERE organization_id=$1 AND quotation_version_id=$2",[org,version.id])));
  assert.ok(edits.every(r=>r.status==="rejected"));
  console.log("PASS: independent PostgreSQL confirmations issue one invoice, three logical intents, no payment; finalized item changes fail.");
  console.log(`Fixture organization: ${org}. Discard the isolated test database after review.`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Sales PostgreSQL test failed"); process.exitCode=1; });
