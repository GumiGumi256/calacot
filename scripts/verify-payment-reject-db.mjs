// Rejecting a payment awaiting verification (migration 0030) against a disposable, fully migrated PGlite
// schema. No environment variables, no network, no real database.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const pg = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fails = async (q, params, code) => {
  await assert.rejects(pg.query(q, params), (e) => { assert.match(String(e.message), new RegExp(code)); return true; });
};
try {
  const journal = JSON.parse(await readFile("drizzle-current/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) for (const s of (await readFile(`drizzle-current/${entry.tag}.sql`, "utf8")).split("--> statement-breakpoint")) if (s.trim()) await pg.exec(s);
  await pg.exec(`INSERT INTO organizations(id,name,legal_name) VALUES('a','A','A');
    INSERT INTO clients(id,organization_id,kind,display_name,department) VALUES('${id(1)}','a','individual','Client','painting');
    INSERT INTO staff_memberships(id,organization_id,clerk_user_id,status) VALUES('${id(2)}','a','finance','active');
    INSERT INTO payments(id,organization_id,client_id,amount,currency,method,reference,idempotency_key,received_at,status) VALUES
      ('${id(10)}','a','${id(1)}',2500000,'UGX','bank_transfer','REF-1','k1',now(),'submitted'),
      ('${id(11)}','a','${id(1)}',2500000,'UGX','bank_transfer','REF-2','k2',now(),'submitted');
    INSERT INTO payments(id,organization_id,client_id,amount,currency,method,reference,idempotency_key,received_at,status,confirmed_at,confirmed_by_id,receipt_number) VALUES
      ('${id(12)}','a','${id(1)}',2500000,'UGX','bank_transfer','REF-0','k0',now(),'confirmed',now(),'${id(2)}','CAL-R-1');`);
  const reject = (pid, reason) => pg.query("SELECT payment_reject('a','finance',$1::uuid,$2,'corr') AS r", [pid, reason]);

  await reject(id(10), "Duplicate of CAL-R-1");
  const p = (await pg.query("SELECT status,notes FROM payments WHERE id=$1", [id(10)])).rows[0];
  assert.deepEqual(p, { status: "rejected", notes: "Duplicate of CAL-R-1" });
  const audit = (await pg.query("SELECT actor_clerk_user_id a, changes->>'reason' r FROM audit_logs WHERE action='payment.reject' AND entity_id=$1", [id(10)])).rows;
  assert.deepEqual(audit, [{ a: "finance", r: "Duplicate of CAL-R-1" }]);
  await reject(id(10), "again"); // already rejected: no change, no error
  assert.equal((await pg.query("SELECT count(*)::int n FROM audit_logs WHERE action='payment.reject'")).rows[0].n, 1);

  await fails("SELECT payment_reject('a','finance',$1::uuid,'no','c')", [id(11)], "reject_reason_required");
  await fails("SELECT payment_reject('a','finance',$1::uuid,'Wrong','c')", [id(12)], "payment_not_rejectable");
  await fails("SELECT payment_reject('b','finance',$1::uuid,'Wrong','c')", [id(11)], "payment_unavailable");
  assert.equal((await pg.query("SELECT status FROM payments WHERE id=$1", [id(12)])).rows[0].status, "confirmed", "confirmed payments are never rejected");

  console.log("PASS: payments awaiting verification can be rejected with a reason and an audit entry; confirmed payments, short reasons and other organizations are refused; repeats change nothing.");
} finally { await pg.close(); }
