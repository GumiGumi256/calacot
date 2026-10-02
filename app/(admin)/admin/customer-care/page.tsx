import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/database/db";
import {
  careConversations,
  careJobs,
  careRequests,
} from "@/database/customer-care-schema";
import { whatsappMessages, whatsappContacts } from "@/database/schema";
import { requireAdmin } from "@/lib/design-purchases/permissions";
import {
  setConversationMode,
  sendReviewedReply,
  unlinkConversation,
  updateCareRequest,
} from "@/lib/customer-care/admin-actions";
import { client } from "@/sanity/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasServiceWindow } from "@/lib/whatsapp/webhook";

export const metadata = {
  title: "Customer care inbox",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function CustomerCareInbox({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; page?: string; mode?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const phone =
    query.phone && /^[1-9]\d{7,14}$/.test(query.phone) ? query.phone : null;
  const mode = ["bot", "human", "closed"].includes(query.mode || "")
    ? (query.mode as "bot" | "human" | "closed")
    : undefined;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page || "1", 10) || 1),
  );
  const [
    conversations,
    selectedRows,
    messages,
    contactRows,
    requests,
    failures,
    knowledge,
  ] = await Promise.all([
    db
      .select()
      .from(careConversations)
      .where(mode ? eq(careConversations.mode, mode) : undefined)
      .orderBy(desc(careConversations.updatedAt))
      .limit(31)
      .offset((page - 1) * 30),
    phone
      ? db
          .select()
          .from(careConversations)
          .where(eq(careConversations.phone, phone))
      : Promise.resolve([]),
    phone
      ? db
          .select()
          .from(whatsappMessages)
          .where(eq(whatsappMessages.customerPhone, phone))
          .orderBy(desc(whatsappMessages.eventAt))
          .limit(80)
      : Promise.resolve([]),
    phone
      ? db
          .select()
          .from(whatsappContacts)
          .where(eq(whatsappContacts.phone, phone))
      : Promise.resolve([]),
    phone
      ? db
          .select()
          .from(careRequests)
          .where(eq(careRequests.phone, phone))
          .orderBy(desc(careRequests.createdAt))
          .limit(20)
      : Promise.resolve([]),
    db
      .select()
      .from(careJobs)
      .where(sql`${careJobs.state}='dead' OR ${careJobs.errorCode} IS NOT NULL`)
      .orderBy(desc(careJobs.updatedAt))
      .limit(20),
    client
      .fetch<
        { _id: string; title: string }[]
      >(`*[_type=="customerCareKnowledge" && approvalStatus=="approved" && active==true && defined(lastReviewedAt)] | order(title)[0...100] {_id,title}`, {}, { perspective: "published", useCdn: false, cache: "no-store" })
      .catch(() => []),
  ]);
  const [selected] = selectedRows;
  const [contact] = contactRows;
  const canReply =
    !!contact && !contact.optedOutAt && hasServiceWindow(contact.lastInboundAt);
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 pb-20 pt-28 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
         
          <h1 className="mt-3 text-4xl font-medium">Customer care.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Review enquiries, take over conversations, and send reviewed
            answers.
          </p>
        </div>
        <Link
          href="/admin/customer-care/knowledge"
          className="text-sm underline"
        >
          Manage knowledge
        </Link>
      </div>
      <nav className="my-6 flex gap-4" aria-label="Conversation filter">
        {["all", "bot", "human", "closed"].map((m) => (
          <Link
            key={m}
            href={`/admin/customer-care${m === "all" ? "" : `?mode=${m}`}`}
            className="text-sm capitalize underline"
          >
            {m}
          </Link>
        ))}
      </nav>
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="rounded-xl border border-border p-4">
          <form method="get" className="mb-4 flex gap-2">
            <Input
              name="phone"
              aria-label="Search WhatsApp phone"
              placeholder="Phone number"
            />
            <Button type="submit" size="sm">
              Find
            </Button>
          </form>
          {conversations.slice(0, 30).map((c) => (
            <Link
              key={c.phone}
              href={`/admin/customer-care?phone=${c.phone}`}
              className={`mb-2 block rounded-lg border p-3 ${phone === c.phone ? "bg-muted" : ""}`}
            >
              <span className="text-sm font-medium">+{c.phone}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {c.mode} Â· {c.businessUnit || "New enquiry"}
              </span>
            </Link>
          ))}
          {!conversations.length && (
            <p className="text-sm text-muted-foreground">
              No conversations yet.
            </p>
          )}
          <div className="mt-4 flex justify-between text-xs">
            {page > 1 && (
              <Link href={`?page=${page - 1}&mode=${mode || ""}`}>
                Previous
              </Link>
            )}
            {conversations.length > 30 && (
              <Link href={`?page=${page + 1}&mode=${mode || ""}`}>Next</Link>
            )}
          </div>
        </aside>
        <section className="rounded-xl border border-border p-5">
          {selected ? (
            <>
              <h2 className="text-xl font-medium">+{selected.phone}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {selected.mode} Â·{" "}
                {contact?.optedOutAt
                  ? "Opted out"
                  : canReply
                    ? "Reply window open"
                    : "Reply window closed"}
                {selected.assignedTo
                  ? ` Â· Assigned to ${selected.assignedTo}`
                  : ""}
              </p>
              <div className="my-4 flex flex-wrap gap-2">
                {(["human", "bot", "closed"] as const).map((m) => (
                  <form key={m} action={setConversationMode}>
                    <input type="hidden" name="phone" value={selected.phone} />
                    <input type="hidden" name="mode" value={m} />
                    <Button type="submit" size="sm" variant="outline">
                      {m === "human"
                        ? "Take over"
                        : m === "bot"
                          ? "Resume bot"
                          : "Close"}
                    </Button>
                  </form>
                ))}
                <form action={unlinkConversation}>
                  <input type="hidden" name="phone" value={selected.phone} />
                  <Button type="submit" size="sm" variant="outline">
                    Unlink account
                  </Button>
                </form>
              </div>
              <div
                className="max-h-[520px] space-y-3 overflow-y-auto rounded-lg bg-muted/30 p-4"
                aria-label="Conversation messages"
              >
                {[...messages].reverse().map((m) => (
                  <article
                    key={m.id}
                    className={`max-w-[90%] rounded-lg border bg-background p-3 ${m.direction === "outbound" ? "ml-auto" : ""}`}
                  >
                    <p className="mb-2 text-xs text-muted-foreground">
                      {m.direction === "inbound" ? "Customer" : "Calacot"} Â·{" "}
                      {m.eventAt.toISOString()} Â· {m.status || m.messageType}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {m.body || `[${m.rawMessageType || m.messageType}]`}
                    </p>
                    {m.errorCode && (
                      <p className="mt-2 text-xs text-destructive">
                        {m.errorCode}
                      </p>
                    )}
                  </article>
                ))}
              </div>
              <form action={sendReviewedReply} className="mt-5 space-y-3">
                <input type="hidden" name="replyId" value={randomUUID()} />
                <input type="hidden" name="phone" value={selected.phone} />
                <label className="block text-sm">
                  Reviewed response
                  <select
                    name="template"
                    className="mt-2 block w-full rounded-lg border bg-background p-3"
                    disabled={!canReply}
                  >
                    <option value="handoff">Personal assistance</option>
                    <option value="details">Request project details</option>
                    <option value="welcome">Welcome and services</option>
                    <option value="missing">Information unavailable</option>
                    <option value="knowledge">Approved knowledge answer</option>
                  </select>
                </label>
                <label className="block text-sm">
                  Knowledge entry
                  <select
                    name="knowledgeId"
                    className="mt-2 block w-full rounded-lg border bg-background p-3"
                    disabled={!canReply}
                  >
                    <option value="">Choose an entry</option>
                    {knowledge.map((k) => (
                      <option key={k._id} value={k._id}>
                        {k.title}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" disabled={!canReply}>
                  Send reviewed reply
                </Button>
              </form>
              <h3 className="mb-3 mt-7 font-medium">Support requests</h3>
              {requests.map((r) => (
                <div key={r.id} className="mb-3 rounded-lg border p-3">
                  <p className="text-sm">
                    {r.kind} Â· {r.businessUnit || "Customer care"}
                  </p>
                  <pre className="my-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {JSON.stringify(r.fields, null, 2)}
                  </pre>
                  <form action={updateCareRequest} className="flex gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <select
                      name="status"
                      defaultValue={r.status}
                      className="rounded border bg-background px-2 text-sm"
                    >
                      <option>new</option>
                      <option>contacted</option>
                      <option>closed</option>
                    </select>
                    <Button type="submit" size="sm" variant="outline">
                      Save
                    </Button>
                  </form>
                </div>
              ))}
            </>
          ) : (
            <p className="text-muted-foreground">
              Choose a conversation to review its messages and enquiries.
            </p>
          )}
        </section>
      </div>
      {failures.length > 0 && (
        <section className="mt-6 rounded-xl border p-5">
          <h2 className="font-medium">Queue attention</h2>
          {failures.map((j) => (
            <p key={j.id} className="mt-2 text-sm">
              <Link className="underline" href={`?phone=${j.phone}`}>
                +{j.phone}
              </Link>{" "}
              Â· {j.state} Â· {j.errorCode} Â· Attempts {j.attempts}
            </p>
          ))}
        </section>
      )}
    </main>
  );
}
