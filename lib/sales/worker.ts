import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import type { CreateEmailOptions } from "resend";
import { db } from "@/database/db";
import { getEmailClient } from "@/lib/email/client";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { finalArtifact, artifactShare } from "./artifacts";
import { emailContent } from "./email";
import { salesConfig } from "./config";
import { backoff, recoveryDecision, whatsappEligible } from "./worker-policy";
import type { DocumentSnapshot } from "./document-model";
export type SalesJob = {
  id: string;
  organization_id: string;
  locked_by: string;
  attempts: number;
  payload: { intentId: string };
};
type Intent = {
  id: string;
  organization_id: string;
  entity_type: "quotation" | "invoice";
  entity_id: string;
  channel: "email" | "whatsapp";
  recipient: string;
  payload: Record<string, unknown>;
  status: string;
  provider_id: string | null;
  first_attempt_at: string | null;
  created_at: string;
};
class DeliveryFailure extends Error {
  constructor(
    public code: string,
    public terminal = false,
    public uncertain = false,
    public retryAfter = 0,
  ) {
    super(code);
  }
}
const json = (p: unknown) => sql`${JSON.stringify(p)}::jsonb`;
function fence(job: SalesJob) {
  return sql`EXISTS(SELECT 1 FROM automation_outbox o WHERE o.id=${job.id}::uuid AND o.organization_id=${job.organization_id} AND o.locked_by=${job.locked_by} AND o.status='processing' AND o.lease_expires_at>now())`;
}
async function finish(
  job: SalesJob,
  d: Intent,
  state: string,
  code: string | null = null,
  providerId: string | null = null,
  terminal = true,
  retryAfter = 0,
) {
  const outboxState = terminal
    ? state === "failed" || state === "blocked" || state === "uncertain"
      ? "dead"
      : "completed"
    : "failed";
  await db.execute(
    sql`WITH eligible AS (SELECT id FROM automation_outbox WHERE id=${job.id}::uuid AND organization_id=${job.organization_id} AND locked_by=${job.locked_by} AND status='processing' AND lease_expires_at>now() FOR UPDATE), changed AS (UPDATE delivery_intents SET status=CASE WHEN status IN ('delivered','read','suppressed','bounced') THEN status ELSE ${state} END,error_code=${code},provider_id=coalesce(provider_id,${providerId}),submitted_at=CASE WHEN ${providerId}::text IS NOT NULL THEN coalesce(submitted_at,now()) ELSE submitted_at END,updated_at=now() WHERE id=${d.id}::uuid AND organization_id=${job.organization_id} AND EXISTS(SELECT 1 FROM eligible) RETURNING id), attempted AS (INSERT INTO delivery_attempts(organization_id,intent_id,attempt,state,code) SELECT ${job.organization_id},id,${job.attempts},${state},${code} FROM changed) UPDATE automation_outbox SET status=${outboxState},completed_at=CASE WHEN ${outboxState}='completed' THEN now() ELSE NULL END,last_error_code=${code},available_at=now()+${backoff(job.attempts, retryAfter)}*interval '1 second',locked_by=NULL,locked_at=NULL,lease_expires_at=NULL,updated_at=now() WHERE id IN(SELECT id FROM eligible)`,
  );
  console.info("sales_delivery_result", {
    correlation: d.id,
    job: job.id,
    channel: d.channel,
    state,
    code,
    attempt: job.attempts,
  });
}
async function attempt(job: SalesJob, d: Intent) {
  const cfg = salesConfig();
  if (
    [
      "provider_accepted",
      "delivered",
      "read",
      "captured",
      "suppressed",
      "bounced",
      "skipped",
    ].includes(d.status)
  )
    return finish(job, d, d.status, null, d.provider_id);
  const recovery = cfg.mode === "capture" ? "submit" : recoveryDecision(
    d.channel,
    d.first_attempt_at,
    d.provider_id,
  );
  if (recovery === "complete")
    return finish(job, d, "provider_accepted", null, d.provider_id);
  if (recovery === "uncertain")
    throw new DeliveryFailure("provider_ambiguous", true, true);
  if (
    cfg.mode === "staging" &&
    !cfg.allowlist.includes(d.recipient.toLowerCase())
  )
    throw new DeliveryFailure("staging_recipient_not_allowed", true);
  if (d.channel === "whatsapp") {
    const contact = await db.execute<{ opted_out_at: string | null }>(
      sql`SELECT opted_out_at FROM whatsapp_contacts WHERE phone=${d.recipient.replace(/^\+/, "")}`,
    );
    const reason = whatsappEligible(
      { recipient: d.recipient, ...d.payload },
      !!contact.rows[0]?.opted_out_at,
    );
    if (reason) return finish(job, d, "skipped", reason);
    const liveTemplate = salesConfig();
    if (
      !liveTemplate.templateApproved ||
      liveTemplate.template !== d.payload.template
    )
      throw new DeliveryFailure("approved_template_missing", true);
    if (cfg.mode !== "capture") getWhatsAppConfig();
    const w = await db.execute<{
      id: string;
      status: string | null;
      wamid: string | null;
    }>(
      sql`INSERT INTO whatsapp_messages(id,dedupe_key,customer_phone,direction,message_type,template_name,status,event_at) VALUES(${d.id}::uuid,${"sales/" + d.organization_id + "/" + d.id},${d.recipient.replace(/^\+/, "")},'outbound','template',${String(d.payload.template)},'queued',now()) ON CONFLICT(dedupe_key) DO UPDATE SET dedupe_key=excluded.dedupe_key RETURNING id,status,wamid`,
    );
    if (w.rows[0].wamid)
      return finish(job, d, "provider_accepted", null, w.rows[0].wamid);
    if (w.rows[0].status === "sending" || w.rows[0].status === "uncertain")
      throw new DeliveryFailure("provider_ambiguous", true, true);
  }
  let sendPayload: CreateEmailOptions | undefined;
  if (d.channel === "email") {
    const suppressed = await db.execute(
      sql`SELECT id FROM delivery_intents WHERE channel='email' AND lower(recipient)=lower(${d.recipient}) AND (bounced_at IS NOT NULL OR complained_at IS NOT NULL) LIMIT 1`,
    );
    if (suppressed.rows.length)
      return finish(job, d, "suppressed", "recipient_suppressed");
    const doc = d.payload.document as DocumentSnapshot;
    const artifact = await finalArtifact(
      d.organization_id,
      d.entity_type,
      d.entity_id,
      doc,
    );
    const url = await artifactShare(
      d.organization_id,
      artifact.id,
      d.id,
      String(d.created_at),
      d.recipient,
    );
    sendPayload = d.payload.emailPayload as CreateEmailOptions | undefined;
    if (!sendPayload) {
      const content = await emailContent(doc, url);
      sendPayload = {
        from: String(d.payload.from),
        replyTo: String(d.payload.replyTo) || undefined,
        to: d.recipient,
        ...content,
        attachments:
          artifact.bytes.length < 10 * 1024 * 1024
            ? [
                {
                  filename: doc.number + ".pdf",
                  content: artifact.bytes.toString("base64"),
                },
              ]
            : undefined,
      };
      if (artifact.bytes.length >= 10 * 1024 * 1024)
        sendPayload.text +=
          "\nThe PDF exceeds the attachment limit. Use the secure download link above.";
      const saved = await db.execute(
        sql`UPDATE delivery_intents SET document_id=${artifact.id}::uuid,payload=payload||jsonb_build_object('emailPayload',${json(sendPayload)}),updated_at=now() WHERE id=${d.id}::uuid AND organization_id=${d.organization_id} AND ${fence(job)} RETURNING id`,
      );
      if (!saved.rows.length) return;
    }
    if (cfg.mode !== "capture" && !getEmailClient())
      throw new DeliveryFailure("sender_configuration_missing", true);
  }
  // Persist submission marker and renew fencing lease immediately before the external call.
  const marked = await db.execute(
    sql`WITH lease AS(UPDATE automation_outbox SET lease_expires_at=now()+interval '5 minutes' WHERE id=${job.id}::uuid AND locked_by=${job.locked_by} AND status='processing' AND lease_expires_at>now() RETURNING id) UPDATE delivery_intents SET status='processing',first_attempt_at=coalesce(first_attempt_at,now()),updated_at=now() WHERE id=${d.id}::uuid AND organization_id=${job.organization_id} AND EXISTS(SELECT 1 FROM lease) RETURNING id`,
  );
  if (!marked.rows.length) return;
  if (cfg.mode === "capture") {
    await mkdir("tmp/sales-capture", { recursive: true });
    await writeFile(
      `tmp/sales-capture/${d.id}.json`,
      JSON.stringify(
        sendPayload || { recipient: d.recipient, template: d.payload },
        null,
        2,
      ),
    );
    if (sendPayload?.html)
      await writeFile(`tmp/sales-capture/${d.id}.html`, sendPayload.html);
    return finish(job, d, "captured", "local_capture_no_provider_send");
  }
  if (d.channel === "email") {
    const client = getEmailClient()!;
    try {
      // Installed SDK passes request options through to fetch; keep each submission bounded.
      const requestOptions = {
        idempotencyKey: `sales/${d.organization_id}/${d.entity_type}/${d.entity_id}/email/${d.id}`,
        signal: AbortSignal.timeout(20000),
      };
      const result = await client.client.emails.send(sendPayload!, requestOptions);
      if (result.error) {
        const code = result.error.statusCode || 500;
        const retryAfter = Math.min(3600,Math.max(0,Number(result.headers?.["retry-after"]||0)));
        throw new DeliveryFailure(
          code === 429
            ? "provider_rate_limited"
            : code >= 500
              ? "provider_ambiguous"
              : "provider_rejected",
          code >= 400 && code < 500 && code !== 429,
          false,
          code === 429 ? Math.max(60,retryAfter) : retryAfter,
        );
      }
      if (!result.data?.id) throw new DeliveryFailure("provider_ambiguous");
      await finish(job, d, "provider_accepted", null, result.data.id);
    } catch (e) {
      if (e instanceof DeliveryFailure) throw e;
      throw new DeliveryFailure("provider_ambiguous");
    }
  } else {
    const ready = await db.execute(
      sql`UPDATE whatsapp_messages SET status='sending',attempted_at=now() WHERE id=${d.id}::uuid AND status='queued' AND ${fence(job)} AND NOT EXISTS(SELECT 1 FROM whatsapp_contacts WHERE phone=${d.recipient.replace(/^\+/, "")} AND opted_out_at IS NOT NULL) RETURNING id`,
    );
    if (!ready.rows.length)
      return finish(
        job,
        d,
        "skipped",
        "recipient_opted_out_or_message_unavailable",
      );
    const p = d.payload;
    const result = await sendWhatsAppTemplate(
      d.recipient.replace(/^\+/, ""),
      d.id,
      {
        name: String(p.template),
        language: String(p.language),
        components: [
          {
            type: "body",
            parameters: [p.client, p.project, p.quotation, p.invoice].map(
              (v) => ({ type: "text", text: String(v) }),
            ),
          },
        ],
      },
    );
    await db.execute(
      sql`UPDATE whatsapp_messages SET status=CASE WHEN status IN ('delivered','read') THEN status ELSE ${result.ok ? "sent" : result.uncertain ? "uncertain" : "failed"} END,wamid=coalesce(wamid,${result.ok ? result.wamid : null}),error_code=${result.ok ? null : result.uncertain ? "provider_ambiguous" : "provider_rejected"},updated_at=now() WHERE id=${d.id}::uuid AND ${fence(job)}`,
    );
    if (!result.ok)
      throw new DeliveryFailure(
        result.uncertain ? "provider_ambiguous" : "provider_rejected",
        true,
        result.uncertain,
      );
    await finish(job, d, "provider_accepted", null, result.wamid);
  }
}
export async function runSalesWorker(limit = 5) {
  const org = process.env.CALACOT_CLERK_ORG_ID;
  if (!org) throw new Error("sales_organization_missing");
  const token = randomUUID(),
    start = Date.now();
  let processed = 0;
  await db.execute(sql`SELECT sales_webhook_apply()`);
  await db.execute(
    sql`WITH exhausted AS (UPDATE automation_outbox SET status='dead',last_error_code='attempts_exhausted',locked_by=NULL,locked_at=NULL,lease_expires_at=NULL WHERE organization_id=${org} AND event_type='sales.delivery' AND attempts>=8 AND (status IN('pending','failed') OR (status='processing' AND lease_expires_at<now())) RETURNING payload) UPDATE delivery_intents SET status='failed',error_code='attempts_exhausted',updated_at=now() WHERE organization_id=${org} AND status IN('queued','processing','failed') AND id IN(SELECT (payload->>'intentId')::uuid FROM exhausted)`,
  );
  for (
    let n = 0;
    n < Math.min(Math.max(limit, 1), 10) && Date.now() - start < 45000;
    n++
  ) {
    const job = (
      await db.execute<SalesJob>(
        sql`SELECT * FROM sales_claim(${token},${org})`,
      )
    ).rows[0];
    if (!job) break;
    const d = (
      await db.execute<Intent>(
        sql`SELECT * FROM delivery_intents WHERE id=${job.payload.intentId}::uuid AND organization_id=${org}`,
      )
    ).rows[0];
    if (!d) {
      await db.execute(
        sql`UPDATE automation_outbox SET status='dead',last_error_code='intent_missing',locked_by=NULL,locked_at=NULL,lease_expires_at=NULL WHERE id=${job.id}::uuid AND locked_by=${token}`,
      );
      continue;
    }
    try {
      await attempt(job, d);
    } catch (e) {
      const failure =
        e instanceof DeliveryFailure
          ? e
          : new DeliveryFailure(
              e instanceof Error &&
                /configuration|size_limit|checksum/.test(e.message)
                ? e.message
                : "artifact_or_provider_failure",
              e instanceof Error &&
                /configuration|size_limit|checksum/.test(e.message),
            );
      const terminal = failure.terminal || job.attempts >= 8;
      await finish(
        job,
        d,
        failure.uncertain
          ? "uncertain"
          : failure.terminal
            ? "blocked"
            : "failed",
        failure.code,
        null,
        terminal,
        failure.retryAfter,
      );
    }
    processed++;
  }
  await db.execute(sql`SELECT sales_webhook_apply()`);
  const metrics = (
    await db.execute(
      sql`SELECT status,count(*)::int AS count,extract(epoch FROM now()-min(created_at))::int AS oldest_seconds FROM automation_outbox WHERE organization_id=${org} AND event_type='sales.delivery' GROUP BY status`,
    )
  ).rows;
  console.info("sales_outbox_metrics", { processed, metrics });
  return { processed, metrics };
}
