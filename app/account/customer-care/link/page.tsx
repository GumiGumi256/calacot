import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/database/db";
import { careLinkTokens } from "@/database/customer-care-schema";
import { requireUser } from "@/lib/design-purchases/permissions";
import { Button } from "@/components/ui/button";
import { approveAccountLink } from "./actions";

export const metadata = {
  title: "Link WhatsApp customer care",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export const dynamic = "force-dynamic";
export default async function AccountLink({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; result?: string }>;
}) {
  const { token, result } = await searchParams;
  const valid = token && /^[a-f0-9]{64}$/.test(token) ? token : null;
  await requireUser(
    valid
      ? `/account/customer-care/link?token=${valid}`
      : "/account/customer-care/link",
  );
  const [link] = valid
    ? await db
        .select()
        .from(careLinkTokens)
        .where(
          and(
            eq(
              careLinkTokens.hash,
              createHash("sha256").update(valid).digest("hex"),
            ),
            isNull(careLinkTokens.usedAt),
            gt(careLinkTokens.expiresAt, new Date()),
          ),
        )
    : [];
  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 pb-20 pt-32">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Calacot customer care
      </p>
      <h1 className="my-5 text-3xl font-medium">Link your WhatsApp.</h1>
      {link && valid ? (
        <>
          <p className="mb-6 text-sm text-muted-foreground">
            Allow WhatsApp +{link.phone} to view quotations and invoices, review
            and explicitly confirm quotations, and check design purchases from
            your signed-in Calacot account for 24 hours. Approve only if this is
            your WhatsApp conversation. You can send “unlink account” there to
            revoke access.
          </p>
          <form action={approveAccountLink}>
            <input type="hidden" name="token" value={valid} />
            <Button type="submit">Approve account link</Button>
          </form>
        </>
      ) : (
        <p className="text-sm">
          {result === "linked"
            ? "Your account is linked. Return to WhatsApp and choose ‘I've linked my account’, then select the service you need."
            : "This link has expired or has already been used. Request a new link in your WhatsApp conversation."}
        </p>
      )}
    </main>
  );
}
