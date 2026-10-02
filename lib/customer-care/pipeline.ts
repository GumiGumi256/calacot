import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/database/db";
import {
  careConversations,
  careLinkTokens,
  careRequests,
} from "@/database/customer-care-schema";
import { careMenuOptions, CARE_MENU_MESSAGE, getCareMenuChoice } from "./menu";
import { loadCompanyProfile } from "./knowledge";
import { authorisedOrder, authorisedSupport } from "./live-data";
import {
  renderAccountLink,
  renderKnowledge,
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
  businessUnit?: string,
) {
  await db
    .insert(careRequests)
    .values({
      jobId: job.id,
      phone: job.phone,
      kind,
      businessUnit,
      fields: {},
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
async function accountLink(job: CareJob) {
  const token = randomBytes(32).toString("hex");
  await db.insert(careLinkTokens).values({
    hash: createHash("sha256").update(token).digest("hex"),
    phone: job.phone,
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });
  return renderAccountLink(token);
}
async function accountReply(
  job: CareJob,
  kind: "order" | "support",
  body: string,
) {
  const [linked] = await db
    .select({ clerkUserId: careConversations.clerkUserId })
    .from(careConversations)
    .where(
      and(
        eq(careConversations.phone, job.phone),
        gt(careConversations.linkedUntil, new Date()),
      ),
    );
  if (!linked?.clerkUserId) return accountLink(job);
  if (kind === "support") return authorisedSupport(job.phone);
  const reference = body.trim().toUpperCase();
  if (!/^CAL-DES-[A-F0-9]{16}$/.test(reference)) return templates.reference;
  return authorisedOrder(job.phone, reference);
}
export async function prepareReply(
  job: CareJob,
  body: string | null,
  type: string,
): Promise<string> {
  if (type !== "text" && type !== "interactive") return CARE_MENU_MESSAGE;
  const text = body?.trim() || "";
  if (/^(menu|start|hello|hi|hey|good morning|good afternoon|good evening|thanks|thank you)[.!\s]*$/i.test(text))
    return CARE_MENU_MESSAGE;
  if (/^(human|agent|advisor|talk to our team)$/i.test(text))
    return request(job, "handoff");
  if (/^(unlink|unlink account)$/i.test(text)) {
    await db.execute(revokeLinkQuery(job.phone));
    return CARE_MENU_MESSAGE;
  }
  if (/^CAL-DES-[A-F0-9]{16}$/i.test(text))
    return accountReply(job, "order", text);
  if (/^(support status|my support requests?)$/i.test(text))
    return accountReply(job, "support", text);

  const choice = getCareMenuChoice(text);
  if (!choice) return CARE_MENU_MESSAGE;
  if (choice === "order_status") return accountReply(job, "order", text);
  if (choice === "support_status") return accountReply(job, "support", text);
  if (choice === "talk_to_team") return request(job, "handoff");

  const option = careMenuOptions.find((item) => item.id === choice);
  if (!option || !("businessUnit" in option)) return CARE_MENU_MESSAGE;
  const profile = await loadCompanyProfile();
  const service = profile?.businessUnits.find(
    (item) => item.unit === option.businessUnit,
  );
  if (!profile || !service) return request(job, "handoff", option.businessUnit);
  return `${renderKnowledge(service.description, profile.website)}\n\nReply MENU to choose another Calacot topic.`;
}

export async function recordFailureHandoff(job: CareJob) {
  await request(job, "handoff");
  await db.execute(
    sql`INSERT INTO care_audit(actor,phone,action,details) VALUES ('worker',${job.phone},'processing_failed',jsonb_build_object('jobId',${job.id}::text))`,
  );
}
