import assert from "node:assert/strict";
import { buildEnquiryEmails, deliverEnquiryEmails, type EnquiryEmail } from "../lib/email/enquiry";
import { buildDesignEmails, deliverDesignMessages, type DesignEmailKind } from "../lib/design-purchases/email-messages";
import type { DesignPurchaseRecord } from "../database/schema";
import { normalizeWhatsAppPhone } from "../lib/whatsapp/phone";
import { postWhatsAppMessage } from "../lib/whatsapp/transport";
import { templateComponents } from "../lib/whatsapp/templates";
import { renderNotificationTemplate } from "../lib/email/template";
import { enquirySchema, defaultValues } from "../lib/enquiry-schema";
import { propertyLeadSchema } from "../lib/property-lead-schema";

async function main() {
  const purchase = {
    id: "b35dc648-e894-433b-a1af-fbdf623b8784", customerName: "Sample Customer",
    customerEmail: "delivered@resend.dev", customerPhone: "+256772123456",
    designTitle: "Courtyard <house>", packageName: "Complete package", amount: "1250000.00",
    currency: "UGX", invoiceNumber: "INV-TEST", purchaseReference: "PUR-TEST", revision: "2",
    preferredContactMethod: "whatsapp", customerNote: "<script>private note</script>", adminNotes: "internal-only",
  } as unknown as DesignPurchaseRecord;
  for (const kind of ["invoice", "confirmed", "paymentSubmitted", "assistance", "rejected", "cancelled"] satisfies DesignEmailKind[]) {
    const messages = buildDesignEmails(purchase, kind, "sender@calacot.com", "team@calacot.com", `https://calacot.com/account/designs/${purchase.id}`);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].payload.to, purchase.customerEmail);
    assert.equal(messages[1].payload.to, "team@calacot.com");
    assert.equal(messages[0].payload.replyTo, "team@calacot.com");
    assert.equal(messages[1].payload.replyTo, purchase.customerEmail);
    assert.notEqual(messages[0].key, messages[1].key);
    assert.match(messages[0].payload.html!, /Courtyard &lt;house&gt;/);
    assert.match(messages[0].payload.html!, /calacot-logo-green\.png/);
    assert.match(messages[0].payload.html!, /#1db954/);
    assert(!messages[0].payload.html!.includes("private note"));
    assert(!messages[1].payload.html!.includes("<script>"));
    assert(!messages.some(m => m.payload.text!.includes("internal-only")));
    assert.match(messages[1].payload.html!, /admin\/design-purchases/);
  }
  const keyFor = (revision: string) => buildDesignEmails({ ...purchase, revision }, "paymentSubmitted", "sender@calacot.com", "team@calacot.com", "https://calacot.com")[0].key;
  assert.notEqual(keyFor("2"), keyFor("3"), "Resubmitted payments need a new event key");
  assert.throws(() => renderNotificationTemplate({ heading: "Test", reference: "test", message: "Test", audience: "customer", action: { label: "Test", url: "javascript:alert(1)" } }));
  for (const phone of ["+", "123", "not a number", ""]) assert.equal(normalizeWhatsAppPhone(phone), null);
  assert.equal(normalizeWhatsAppPhone("0772123456"), "256772123456");
  const components = templateComponents(purchase);
  assert.equal(components[0].parameters.length, 5);
  const sent = await postWhatsAppMessage({ accessToken: "test", phoneNumberId: "123", apiVersion: "v23.0" }, {
    messaging_product: "whatsapp", recipient_type: "individual", to: "256772123456", biz_opaque_callback_data: "message-id", type: "template",
    template: { name: "calacot_purchase_created", language: { code: "en_US" }, components },
  }, async (_url, init) => {
    assert.equal(JSON.parse(init!.body as string).biz_opaque_callback_data, "message-id");
    return new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), { status: 200 });
  });
  assert.deepEqual(sent, { ok: true, wamid: "wamid.test" });
  const estate = { ...defaultValues("buy-home"), propertyType: "House", location: "Kampala", fullName: "Sample User", contactMethod: "whatsapp", phone: "+256772123456" };
  assert(!enquirySchema.safeParse(estate).success);
  assert(enquirySchema.safeParse({ ...estate, email: "delivered@resend.dev" }).success);
  const property = { submissionType: "individual", propertyType: "House", location: "Kampala", details: "", fullName: "Sample User", phone: "+256772123456", email: "" };
  assert(!propertyLeadSchema.safeParse(property).success);
  assert(propertyLeadSchema.safeParse({ ...property, email: "delivered@resend.dev" }).success);
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
    const recipients: unknown[] = [];
    const acceptedFields: string[] = [];
    const dependencies = {
      from: "sender@calacot.com", team: "team@calacot.com", url: "https://calacot.com/account/designs/test",
      invoice: async (): Promise<Buffer> => { throw new Error("PDF unavailable"); },
      markAccepted: async (field: string) => { acceptedFields.push(field); },
      send: async (payload: { to: unknown }) => {
        recipients.push(payload.to);
        return payload.to === purchase.customerEmail
          ? { data: null, error: { name: "validation_error", statusCode: 422 } }
          : { data: { id: "team-accepted" }, error: null };
      },
    };
    await deliverDesignMessages(purchase, "invoice", dependencies);
    assert.deepEqual(recipients, [purchase.customerEmail, "team@calacot.com"], "PDF/customer failure must not block the team");
    assert.deepEqual(acceptedFields, ["invoiceTeamEmailSentAt"]);
    recipients.length = 0;
    await deliverDesignMessages({ ...purchase, invoiceEmailSentAt: new Date() }, "invoice", dependencies);
    assert.deepEqual(recipients, ["team@calacot.com"], "Retry must skip the accepted customer email");
    logs.length = 0;
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
  console.log("Notification tests passed: four enquiry forms, six purchase events, both recipients, required email, escaping, reply-to, retries, WhatsApp phone/template/transport.");
}
void main();
