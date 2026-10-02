import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/database/db";
import {
  careConversations,
  careLinkTokens,
  careRequests,
  careJobs,
} from "@/database/customer-care-schema";
import { classifyEnquiry, selectApprovedAction } from "./gemini";
import {
  approvedKnowledgeId,
  permittedAction,
  type Classification,
} from "./contracts";
import { loadCompanyProfile, retrieveKnowledge } from "./knowledge";
import {
  authorisedOrder,
  authorisedSupport,
  designResults,
  propertyResults,
} from "./live-data";
import { paymentInstructions } from "@/lib/company";
import {
  renderAccountLink,
  renderKnowledge,
  renderPayment,
  renderStatic,
  templates,
} from "./render";
import { revokeLinkQuery } from "./queries";

export type CareJob = {
  id: string;
  phone: string;
  message_id: string;
  lease_token: string;
  attempts: number;
};
async function request(
  job: CareJob,
  kind: "lead" | "callback" | "handoff",
  plan?: Classification,
) {
  await db
    .insert(careRequests)
    .values({
      jobId: job.id,
      phone: job.phone,
      kind,
      businessUnit: plan?.businessUnit,
      fields: plan?.extractedFields || {},
    })
    .onConflictDoNothing();
  if (kind === "handoff")
    await db
      .update(careConversations)
      .set({ mode: "human", updatedAt: new Date() })
      .where(
        and(
          eq(careConversations.phone, job.phone),
          eq(careConversations.mode, "bot"),
        ),
      );
  return renderStatic(kind);
}
export async function prepareReply(
  job: CareJob,
  body: string | null,
  type: string,
): Promise<string> {
  if (type !== "text" && type !== "interactive") return templates.attachment;
  if (!body?.trim()) return templates.clarify;
  if (/^(human|agent|advisor|help from a person)$/i.test(body.trim()))
    return request(job, "handoff");
  if (/^(unlink|unlink account)$/i.test(body.trim())) {
    await db.execute(revokeLinkQuery(job.phone));
    return templates.welcome;
  }
  const profile = await loadCompanyProfile();
  if (!profile) return request(job, "handoff");
  const [conversation] = await db
    .select({ businessUnit: careConversations.businessUnit })
    .from(careConversations)
    .where(eq(careConversations.phone, job.phone));
  const plan = await classifyEnquiry(body, profile, conversation);
  const action = permittedAction(plan);
  await db
    .update(careJobs)
    .set({
      decision: {
        scope: plan.scope,
        businessUnit: plan.businessUnit,
        intent: plan.intent,
        action,
        profileVersion: profile.version,
      },
    })
    .where(
      and(eq(careJobs.id, job.id), eq(careJobs.leaseToken, job.lease_token)),
    );
  if (plan.businessUnit && ["in_scope", "mixed"].includes(plan.scope))
    await db
      .update(careConversations)
      .set({ businessUnit: plan.businessUnit })
      .where(eq(careConversations.phone, job.phone));
  switch (action) {
    case "refuse":
      return renderStatic("refuse");
    case "clarify":
      return templates.clarify;
    case "welcome":
      return templates.welcome;
    case "handoff":
      return request(job, "handoff", plan);
    case "designs":
      return designResults(plan.extractedFields);
    case "properties":
      return propertyResults(plan.extractedFields);
    case "lead":
      if (
        !plan.extractedFields.projectDetails &&
        !plan.extractedFields.location
      )
        return templates.details;
      return request(job, "lead", plan);
    case "callback":
      return request(job, "callback", plan);
    case "support":
    case "order": {
      const [linked] = await db
        .select()
        .from(careConversations)
        .where(
          and(
            eq(careConversations.phone, job.phone),
            gt(careConversations.linkedUntil, new Date()),
          ),
        );
      if (!linked?.clerkUserId) {
        const token = randomBytes(32).toString("hex");
        await db
          .insert(careLinkTokens)
          .values({
            hash: createHash("sha256").update(token).digest("hex"),
            phone: job.phone,
            expiresAt: new Date(Date.now() + 15 * 60_000),
          });
        return renderAccountLink(token);
      }
      const reference = plan.extractedFields.purchaseReference;
      if (action === "support") return authorisedSupport(job.phone);
      // Do not act on a hallucinated reference; it must occur verbatim in this inbound message.
      if (!reference || !body.toUpperCase().includes(reference))
        return templates.reference;
      return authorisedOrder(job.phone, reference);
    }
    case "knowledge": {
      if (plan.intent === "payment")
        return renderPayment(paymentInstructions());
      if (plan.intent === "contact")
        return renderKnowledge(profile.contactInformation, profile.website);
      if (plan.intent === "hours")
        return profile.businessHours
          ? renderKnowledge(profile.businessHours)
          : templates.missing;
      const entries = await retrieveKnowledge(plan);
      if (!entries.length) return templates.missing;
      const selected = await selectApprovedAction(body, profile, plan, entries);
      // Second stage cannot expand scope or switch capability, unit or topic.
      const id = approvedKnowledgeId(plan, selected, entries);
      const entry = entries.find((e) => e._id === id);
      if (!entry) return templates.missing;
      await db
        .update(careJobs)
        .set({
          decision: {
            scope: plan.scope,
            intent: plan.intent,
            action,
            profileVersion: profile.version,
            knowledgeId: entry._id,
            knowledgeVersion: entry.version,
          },
        })
        .where(
          and(
            eq(careJobs.id, job.id),
            eq(careJobs.leaseToken, job.lease_token),
          ),
        );
      return renderKnowledge(entry.approvedAnswer, entry.displayLink);
    }
  }
}

export async function recordFailureHandoff(job: CareJob) {
  await request(job, "handoff");
  await db.execute(
    sql`INSERT INTO care_audit(actor,phone,action,details) VALUES ('worker',${job.phone},'processing_failed',jsonb_build_object('jobId',${job.id}::text))`,
  );
}
