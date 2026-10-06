import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/database/db";
import { careConversations } from "@/database/customer-care-schema";
import { eq } from "drizzle-orm";
import {
  menuReply,
  selectedAction,
  parent,
  WELCOME,
  services,
  type MenuState,
  type Option,
} from "./menu-tree";
import {
  identity,
  verificationLink,
  quotes,
  invoices,
  purchase,
  documentLink,
} from "./menu-data";
import { renderOrder, renderPayment } from "./render";
import { paymentInstructions } from "@/lib/company";
import { salesConfig } from "@/lib/sales/config";
import type { CareJob } from "./pipeline";
import { revokeLinkQuery } from "./queries";
export async function prepareMenu(
  job: CareJob,
  body: string | null,
  type: string,
  notice?: string,
) {
  const [conversation] = await db
    .select()
    .from(careConversations)
    .where(eq(careConversations.phone, job.phone));
  if (!conversation) return null;
  const org = process.env.CALACOT_CLERK_ORG_ID,
    account = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (
    !org ||
    !account ||
    conversation.organizationId !== org ||
    conversation.businessAccountId !== account
  )
    throw new Error("care_context_mismatch");
  let state = conversation.menuState as MenuState;
  const timeout = Number(process.env.CUSTOMER_CARE_SESSION_MINUTES || 30);
  let ttl =
    Number.isInteger(timeout) && timeout >= 1 && timeout <= 1440
      ? timeout * 60
      : 1800;
  const expired =
    !conversation.sessionExpiresAt ||
    conversation.sessionExpiresAt.getTime() <= Date.now() ||
    state.flowVersion !== 1;
  let action = selectedAction(state, body || "", type, expired);
  if (
    type === "text" &&
    /^(unlink|unlink account)$/i.test(body?.trim() || "")
  ) {
    await db.execute(revokeLinkQuery(job.phone));
    action = "main";
  }
  let text = "Please choose an option below.",
    extra: Option[] | undefined,
    user: string | null = null;
  let verifiedClientId: string | null = null;
  let command: Record<string, unknown> = {};
  const handoff = (reason: string) => {
    command = { kind: "handoff", reason, service: state.service };
    state = { screen: "main" };
    text =
      "Your enquiry has been passed to the Calacot team for personal assistance.";
  };
  if (conversation.mode === "human") {
    if (
      type !== "text" ||
      body?.trim().toLowerCase() !== "resume" ||
      conversation.assignedTo
    )
      return null;
    command = { kind: "resume" };
    action = "main";
  }
  if (expired) {
    state = { screen: "main" };
    text = WELCOME;
    action = action === "main" ? "main" : null;
  }
  if (action === "main" || action === "cancel") {
    state = { screen: "main" };
    text =
      action === "cancel"
        ? "Cancelled. Please choose an option below."
        : WELCOME;
  } else if (action === "back")
    state = { ...state, screen: parent(state.screen), versionId: undefined };
  else if (action === "team") handoff("customer_requested");
  else if (
    ["services", "start", "quotes", "invoices", "purchases"].includes(
      action || "",
    )
  )
    state = { screen: action! };
  else if (action?.startsWith("service:")) {
    state = { screen: "service", service: action.split(":")[1] };
    const title = services.find(([id]) => id === state.service)?.[1] || "this service";
    text = `You selected ${title}. Choose Start a project to share your requirements, or Talk to our team for assistance.`;
  } else if (action?.startsWith("start:") || action === "start_selected") {
    state = {
      screen: "name",
      service:
        action === "start_selected" ? state.service : action.split(":")[1],
    };
    text =
      "Please type your full name (2–100 characters). We will use this WhatsApp number to follow up.";
  } else if (
    !action &&
    !expired &&
    type === "text" &&
    state.screen === "name"
  ) {
    const name = body?.trim() || "";
    if (name.length < 2 || name.length > 100 || /[\p{Cc}\p{Cf}]/u.test(name))
      text =
        "Please type a name between 2 and 100 characters, or choose Cancel.";
    else {
      state = { ...state, screen: "brief", name };
      text =
        "Briefly describe your project and location (10–600 characters). Please avoid sensitive personal or payment information.";
    }
  } else if (
    !action &&
    !expired &&
    type === "text" &&
    state.screen === "brief"
  ) {
    const brief = body?.trim() || "";
    if (
      brief.length < 10 ||
      brief.length > 600 ||
      /[\p{Cc}\p{Cf}]/u.test(brief.replace(/\n/g, ""))
    )
      text = "Please provide a brief between 10 and 600 characters.";
    else {
      state = { ...state, screen: "summary", brief };
      text = `Review your enquiry:\nName: ${state.name}\nService: ${services.find(([id]) => id === state.service)?.[1]}\nBrief: ${brief.slice(0, 600)}\n\nSubmit this enquiry for team follow-up? This does not agree a project or create a quotation.`;
    }
  } else if (action === "submit" && state.screen === "summary") {
    command = {
      kind: "lead",
      service: state.service,
      fields: { name: state.name, brief: state.brief, phone: job.phone },
    };
    state = { screen: "main" };
    text =
      "Your enquiry has been recorded. A team member will follow up using this WhatsApp number.";
  } else if (
    action ||
    (!expired && state.screen === "reference" && type === "text")
  ) {
    const verified = await identity(job.phone, org);
    if (!verified) {
      state = { screen: "verification" };
      text = await verificationLink(job.phone);
    } else {
      user = verified.user;
      verifiedClientId = verified.clientId;
      if (action === "verified") {
        state = { screen: "main" };
        text =
          "Your authenticated account is linked. Choose quotations, invoices or purchases below.";
      } else if (
        action === "quote_latest" ||
        action === "quote_confirm" ||
        action?.startsWith("quote_pick:")
      ) {
        const quote = (
          await quotes(
            org,
            user,
            0,
            action?.startsWith("quote_pick:")
              ? action.split(":")[1]
              : undefined,
          )
        )[0];
        state = { screen: "quotes" };
        if (!quote)
          text = "We couldn’t find a quotation available for your account.";
        else if (quote.status === "accepted")
          text = `Quotation ${quote.number} for ${quote.document_snapshot.project} is already confirmed${quote.accepted_at ? ` (${quote.accepted_at.slice(0, 10)})` : ""}.`;
        else if (quote.status !== "sent")
          text = `Quotation ${quote.number} is ${quote.status}. Please ask our team for assistance or choose another quotation.`;
        else if (new Date(quote.valid_until).getTime() <= Date.now())
          text = `Quotation ${quote.number} has expired and needs renewal. Please contact our team.`;
        else {
          const link = await documentLink(
            org,
            "quotation",
            quote.id,
            quote.document_snapshot,
            job.id,
          );
          text = `Please review your quotation before confirming:\n\nQuotation: ${quote.number}\nProject: ${quote.document_snapshot.project}\nAmount: ${quote.currency} ${quote.total}\nValid until: ${quote.valid_until.slice(0, 10)}\n\nScope and terms: ${link}\n\nConfirming means you accept this quotation’s scope and terms. It does not confirm payment.`;
          if (action !== "quote_latest") {
            state = { screen: "review", versionId: quote.id };
            ttl = 300;
          }
        }
      } else if (action === "accept" && state.screen === "review") {
        command = { kind: "confirm" };
        state = { screen: "invoices" };
        text = "Confirmation recorded.";
      } else if (action === "quote_list" || action?.startsWith("quote_page:")) {
        const page =
          action === "quote_list" ? 0 : Number(action!.split(":")[1]);
        const rows = await quotes(org, user, page);
        state = { screen: "quote_list", page };
        text = rows.length
          ? "Choose a quotation to review. Only sent versions are listed."
          : "We couldn’t find a quotation available for your account.";
        extra = rows
          .slice(0, 5)
          .map(
            (q) =>
              [
                `quote_pick:${q.id}`,
                `${q.number} / R${q.version}`.slice(0, 24),
              ] as Option,
          );
        if (rows.length > 5 && page < 100)
          extra.push([`quote_page:${page + 1}`, "Next page"]);
        if (page > 0) extra.push([`quote_page:${page - 1}`, "Previous page"]);
        extra.push(["team", "Talk to our team"]);
      } else if (
        action === "invoice_latest" ||
        action === "invoice_outstanding"
      ) {
        state = { screen: "invoices" };
        const rows = await invoices(
          org,
          user,
          action === "invoice_outstanding",
        );
        text = rows.length
          ? (
              await Promise.all(
                rows.map(
                  async (i) =>
                    `${i.number}: ${i.currency} ${i.total}; outstanding ${i.balance}\n${await documentLink(org, "invoice", i.id, i.document_snapshot, job.id)}`,
                ),
              )
            ).join("\n\n")
          : "No matching issued invoices were found for your account.";
      } else if (action === "pay") {
        state = { screen: "invoices" };
        text = renderPayment(paymentInstructions()).replace(
          "purchase reference",
          "invoice reference",
        );
      } else if (action === "purchase_reference") {
        state = { screen: "reference" };
        text =
          "Type your purchase reference, for example CAL-DES followed by its 16-character code.";
      } else if (action === "purchase_latest" || state.screen === "reference") {
        const reference =
          state.screen === "reference" ? body?.trim().toUpperCase() : undefined;
        if (reference && !/^CAL-DES-[A-F0-9]{16}$/.test(reference))
          text =
            "Please type a valid CAL-DES purchase reference or choose Back.";
        else {
          const row = await purchase(job.phone, user, reference);
          state = { screen: "purchases" };
          text = row
            ? renderOrder({
                purchaseReference: row.purchase_reference,
                purchaseStatus: row.purchase_status,
                paymentStatus: row.payment_status,
              })
            : "No matching purchase was found in your linked account.";
        }
      } else {
        text =
          "That selection is no longer available. Please choose an option below.";
      }
    }
  } else if (!expired)
    text =
      "Please use the current options. Free text is accepted only when a step asks for it. Type menu, back or cancel to navigate.";
  if (state.screen === "review") ttl = 300;
  const reply = menuReply(
    user ? { ...state, verifiedUser: user, verifiedClientId } : state,
    notice || text,
    extra,
  );
  const result = await db.execute<{ id: string | null }>(
    sql`SELECT care_menu_commit(${job.id}::uuid,${job.lease_token}::uuid,${conversation.sessionRevision},${org},${account},${user},${JSON.stringify(reply.state)}::jsonb,${JSON.stringify(reply.payload)}::jsonb,${JSON.stringify(command)}::jsonb,${JSON.stringify(salesConfig())}::jsonb,${ttl}) AS id`,
  );
  return result.rows[0].id;
}
