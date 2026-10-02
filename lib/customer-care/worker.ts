import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/database/db";
import { careConversations, careJobs } from "@/database/customer-care-schema";
import { whatsappContacts, whatsappMessages } from "@/database/schema";
import {
  sendWhatsAppInteractiveList,
  sendWhatsAppText,
} from "@/lib/whatsapp/client";
import { hasServiceWindow, isWhatsAppOptOut } from "@/lib/whatsapp/webhook";
import {
  claimJobQuery,
  claimOutboundQuery,
  reapDeadJobsQuery,
} from "./queries";
import { prepareReply, recordFailureHandoff, type CareJob } from "./pipeline";
import { templates } from "./render";
import { CARE_MENU_MESSAGE, careMenuPayload } from "./menu";

/** Persistent outbox: never automatically retry an ambiguous external send. */
export async function deliverCareMessage(
  id: string,
  requireBot = false,
  automated = false,
) {
  const result = await db.execute<{
    id: string;
    customer_phone: string;
    body: string;
    message_type: string;
  }>(claimOutboundQuery(id, requireBot, automated));
  const m = result.rows[0];
  if (!m) return;
  const sent =
    m.message_type === "interactive"
      ? await sendWhatsAppInteractiveList(
          m.customer_phone,
          m.id,
          careMenuPayload,
        )
      : await sendWhatsAppText(m.customer_phone, m.id, m.body);
  await db
    .update(whatsappMessages)
    .set(
      sent.ok
        ? { status: "sent", wamid: sent.wamid, updatedAt: new Date() }
        : {
            status: sent.uncertain ? "uncertain" : "failed",
            errorCode: sent.code,
            updatedAt: new Date(),
          },
    )
    .where(
      and(eq(whatsappMessages.id, id), eq(whatsappMessages.status, "sending")),
    );
}
async function finish(job: CareJob, errorCode?: string) {
  await db
    .update(careJobs)
    .set({
      state: "done",
      leaseUntil: null,
      errorCode: errorCode || null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(careJobs.id, job.id), eq(careJobs.leaseToken, job.lease_token)),
    );
}
async function processJob(job: CareJob) {
  const [message] = await db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.id, job.message_id));
  const [contact] = await db
    .select()
    .from(whatsappContacts)
    .where(eq(whatsappContacts.phone, job.phone));
  const [conversation] = await db
    .select()
    .from(careConversations)
    .where(eq(careConversations.phone, job.phone));
  if (
    !message ||
    !contact ||
    contact.optedOutAt ||
    isWhatsAppOptOut(message.body) ||
    !hasServiceWindow(contact.lastInboundAt) ||
    !hasServiceWindow(message.eventAt)
  )
    return finish(job, "contact_not_eligible");
  const dedupeKey = `care/${job.id}`;
  let [outbound] = await db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.dedupeKey, dedupeKey));
  if (outbound?.status === "sending") {
    await db
      .update(whatsappMessages)
      .set({
        status: "uncertain",
        errorCode: "worker_interrupted",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappMessages.id, outbound.id),
          eq(whatsappMessages.status, "sending"),
        ),
      );
    await recordFailureHandoff(job);
    return finish(job, "delivery_uncertain");
  }
  if (outbound && outbound.status !== "queued") return finish(job);
  if (conversation?.mode !== "bot" && !outbound)
    return finish(job, "human_control");
  const count = await db.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM whatsapp_messages WHERE customer_phone=${job.phone} AND direction='inbound' AND event_at>now()-interval '5 minutes'`,
  );
  if (count.rows[0]?.count > 20 && !outbound) {
    await recordFailureHandoff(job);
    return finish(job, "rate_limited");
  }
  if (!outbound) {
    let body: string;
    try {
      body = await prepareReply(job, message.body, message.messageType);
    } catch {
      // Fail closed. No provider error, prompt, model result or customer content reaches the recipient.
      body = templates.failure;
      await recordFailureHandoff(job);
    }
    // Staff may take over while Gemini is running. A handoff performed by this job is permitted.
    const [current] = await db
      .select()
      .from(careConversations)
      .where(eq(careConversations.phone, job.phone));
    if (
      current?.mode !== "bot" &&
      body !== templates.handoff &&
      body !== templates.failure
    )
      return finish(job, "human_control");
    const lease = await db.execute(
      sql`SELECT id FROM care_jobs WHERE id=${job.id}::uuid AND lease_token=${job.lease_token}::uuid AND lease_until>now()`,
    );
    if (!lease.rows.length) return;
    [outbound] = await db
      .insert(whatsappMessages)
      .values({
        dedupeKey,
        customerPhone: job.phone,
        direction: "outbound",
        messageType: body === CARE_MENU_MESSAGE ? "interactive" : "text",
        body: body.slice(0, 4096),
        status: "queued",
        eventAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (!outbound) return finish(job);
  }
  await deliverCareMessage(
    outbound.id,
    outbound.body !== templates.handoff && outbound.body !== templates.failure,
    true,
  );
  const [sent] = await db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.id, outbound.id));
  if (sent?.status === "uncertain" || sent?.status === "failed") {
    await recordFailureHandoff(job);
    return finish(
      job,
      sent.status === "uncertain" ? "delivery_uncertain" : "delivery_failed",
    );
  }
  if (sent?.status === "queued") {
    await db
      .update(whatsappMessages)
      .set({ status: "failed", errorCode: "send_not_eligible" })
      .where(
        and(
          eq(whatsappMessages.id, outbound.id),
          eq(whatsappMessages.status, "queued"),
        ),
      );
    return finish(job, "send_not_eligible");
  }
  return finish(job);
}

export async function runCareWorker(limit = 3) {
  if (process.env.CUSTOMER_CARE_ENABLED !== "true")
    return { processed: 0, disabled: true };
  // Final-attempt crashes must not permanently block later messages from the same phone.
  await db.execute(reapDeadJobsQuery());
  let processed = 0;
  for (; processed < Math.min(5, Math.max(1, limit)); processed++) {
    const claimed = await db.execute<CareJob>(claimJobQuery(randomUUID()));
    const job = claimed.rows[0];
    if (!job) break;
    try {
      await processJob(job);
    } catch {
      await db
        .update(careJobs)
        .set({
          state: "queued",
          availableAt: new Date(
            Date.now() + Math.min(300_000, 5000 * 2 ** job.attempts),
          ),
          leaseUntil: null,
          errorCode: "processing_error",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(careJobs.id, job.id),
            eq(careJobs.leaseToken, job.lease_token),
          ),
        );
    }
  }
  return { processed };
}
