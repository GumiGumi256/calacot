import "server-only";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/database/db";
import { designPurchases, type DesignPurchaseRecord } from "@/database/schema";
import { getEmailClient, getTeamEmail } from "@/lib/email/client";
import { purchaseUrl } from "@/lib/company";
import { deliverDesignMessages, type DesignEmailKind } from "./email-messages";

export function queueDesignEmail(purchase: DesignPurchaseRecord, kind: DesignEmailKind) {
  after(() => deliverDesignEmail(purchase, kind));
}

export async function deliverDesignEmail(p: DesignPurchaseRecord, kind: DesignEmailKind) {
  const email = getEmailClient();
  const team = getTeamEmail();
  if (!email || !team) {
    console.error("Design email configuration missing or invalid", { purchaseId: p.id, kind });
    return;
  }
  await deliverDesignMessages(p, kind, {
    from: email.from, team, url: purchaseUrl(p.id),
    send: (body, options) => email.client.emails.send(body, options),
    invoice: async () => (await import("./invoice")).generateDesignInvoice(p),
    markAccepted: async (field) => {
      await db.update(designPurchases).set({ [field]: new Date() }).where(eq(designPurchases.id, p.id));
    },
  });
}
