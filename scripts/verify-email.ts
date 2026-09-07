import assert from "node:assert/strict";
import { buildEnquiryEmails, deliverEnquiryEmails, type EnquiryEmail } from "../lib/email/enquiry";

async function main() {
  const enquiry: EnquiryEmail = { id: "saved-id", kind: "project", email: "delivered@resend.dev", details: { fullName: "<script>bad</script>", projectOverview: "<a href='https://untrusted.test'>Click</a>", adminNotes: "private" } };
  const messages = buildEnquiryEmails(enquiry, "Calacot <sender@calacot.com>", "delivered@resend.dev");
  assert.equal(messages.length, 2);
  assert.match(messages[0].payload.html!, /&lt;script&gt;/);
  assert(!messages[0].payload.html!.includes("<script>"));
  assert(!messages[0].payload.text!.includes("private"));
  assert(!messages[1].payload.text!.includes("untrusted"));
  assert.equal(messages[0].payload.replyTo, enquiry.email);
  assert.equal(new Set(messages.map((message) => message.key)).size, 2);
  assert.equal(buildEnquiryEmails({ ...enquiry, email: null }, "sender@calacot.com", "delivered@resend.dev").length, 1);
  for (const kind of ["project", "call", "estate", "property"] as const) {
    assert.equal(buildEnquiryEmails({ ...enquiry, kind }, "sender@calacot.com", "delivered@resend.dev").length, 2);
  }
  assert.match(buildEnquiryEmails({ ...enquiry, kind: "call" }, "sender@calacot.com", "delivered@resend.dev")[1].payload.text!, /not a confirmed appointment/);
  const keys: string[] = [];
  await deliverEnquiryEmails(enquiry, "sender@calacot.com", "delivered@resend.dev", async (_, options) => {
    keys.push(options.idempotencyKey);
    if (keys.length === 1) return { data: null, error: { name: "rate_limit_exceeded", statusCode: 429 } };
    return { data: { id: "accepted" }, error: null };
  }, async () => {});
  assert.equal(keys.length, 3);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
  const originalError = console.error;
  const logs: unknown[][] = [];
  console.error = (...args) => { logs.push(args); };
  try {
    let calls = 0;
    await deliverEnquiryEmails(enquiry, "sender@calacot.com", "delivered@resend.dev", async () => {
      calls++;
      if (calls === 1) return { data: null, error: { name: "validation_error", statusCode: 422 } };
      return { data: { id: "customer-accepted" }, error: null };
    }, async () => {});
    assert.equal(calls, 2, "A team email failure must not block the customer email");
    calls = 0;
    await deliverEnquiryEmails({ ...enquiry, email: null }, "sender@calacot.com", "delivered@resend.dev", async () => {
      calls++;
      throw new Error("network unavailable");
    }, async () => {});
    assert.equal(calls, 3, "Network retries are bounded");
    assert.equal(logs.length, 2);
    assert(!JSON.stringify(logs).includes("delivered@"));
  } finally { console.error = originalError; }
  console.log("Email tests passed: four forms, escaping, optional email, reply-to, retry idempotency, API and network failures.");
}
void main();
