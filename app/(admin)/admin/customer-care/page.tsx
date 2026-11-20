import Link from "next/link";
import Image from "next/image";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  AlertTriangle, ArrowLeft, BookOpen, Bot, CheckCheck, ChevronDown, CircleX, Info,
  Search, Tag, UserRound, Unlink,
} from "lucide-react";
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
  unlinkConversation,
  updateCareRequest,
} from "@/lib/customer-care/admin-actions";
import { hasServiceWindow } from "@/lib/whatsapp/webhook";
import { CustomerCareThread } from "@/components/customer-care-thread";
import { listTime, MODE_LABEL, previewText } from "@/components/customer-care/format";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NativeSelect } from "@/components/ui/native-select";

export const metadata = {
  title: "Customer care inbox",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Mode = "bot" | "human" | "closed";
type Conversation = typeof careConversations.$inferSelect;
type Contact = typeof whatsappContacts.$inferSelect;
type CareRequest = typeof careRequests.$inferSelect;

function inboxHref(params: { phone?: string | null; mode?: Mode; page?: number }) {
  const search = new URLSearchParams();
  if (params.mode) search.set("mode", params.mode);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  if (params.phone) search.set("phone", params.phone);
  const qs = search.toString();
  return `/admin/customer-care${qs ? `?${qs}` : ""}`;
}

const MODE_STYLE: Record<string, string> = {
  bot: "bg-brand-primary/25 text-brand-black dark:text-brand-primary",
  human: "bg-brand-accent/15 text-brand-accent dark:bg-brand-accent/30 dark:text-brand-accent",
  closed: "bg-muted text-muted-foreground",
};

function ChatAvatar({ mode, size = "md" }: { mode: string; size?: "md" | "lg" }) {
  return (
    <span aria-hidden className={cn(
      "flex shrink-0 items-center justify-center rounded-full",
      size === "lg" ? "size-24" : "size-11",
      mode === "closed" ? "bg-muted text-muted-foreground" : "bg-brand-black text-brand-primary dark:bg-brand-primary/15",
    )}>
      <UserRound className={size === "lg" ? "size-12" : "size-6"} />
    </span>
  );
}

function ModePill({ mode }: { mode: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium", MODE_STYLE[mode])}>
      {MODE_LABEL[mode] || mode}
    </span>
  );
}

function FieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;
  if (typeof value === "object") {
    return <pre className="whitespace-pre-wrap break-words font-sans text-xs">{JSON.stringify(value, null, 2)}</pre>;
  }
  return <>{String(value)}</>;
}

function ContactInfo({ conversation, contact, canReply, requests }: {
  conversation: Conversation; contact?: Contact; canReply: boolean; requests: CareRequest[];
}) {
  const windowLabel = contact?.optedOutAt ? "Opted out of messages" : canReply ? "24-hour reply window open" : "Reply window closed";
  return (
    <div className="flex flex-col gap-2 bg-muted/40 pb-6">
      <div className="flex flex-col items-center gap-2 bg-card px-6 py-7 text-center">
        <ChatAvatar mode={conversation.mode} size="lg" />
        <p className="mt-2 type-section-title">+{conversation.phone}</p>
        <ModePill mode={conversation.mode} />
      </div>

      <dl className="grid gap-3 bg-card px-5 py-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">WhatsApp status</dt>
          <dd className={cn("mt-0.5", contact?.optedOutAt ? "text-destructive" : canReply ? "text-foreground" : "text-muted-foreground")}>{windowLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Business unit</dt>
          <dd className="mt-0.5">{conversation.businessUnit || "New enquiry"}</dd>
        </div>
        {conversation.assignedTo && (
          <div>
            <dt className="text-xs text-muted-foreground">Assigned to</dt>
            <dd className="mt-0.5 break-all">{conversation.assignedTo}</dd>
          </div>
        )}
        {conversation.handoffReason && (
          <div>
            <dt className="text-xs text-muted-foreground">Handoff reason</dt>
            <dd className="mt-0.5">{conversation.handoffReason}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted-foreground">Website account</dt>
          <dd className="mt-0.5">{conversation.clerkUserId ? "Linked" : "Not linked"}</dd>
        </div>
      </dl>

      <section className="bg-card px-5 py-4" aria-labelledby="care-requests-heading">
        <h3 id="care-requests-heading" className="flex items-center justify-between text-sm font-medium">
          Support requests <span className="text-xs font-normal text-muted-foreground">{requests.length}</span>
        </h3>
        {requests.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No requests from this customer.</p>}
        <ul className="mt-3 flex flex-col gap-3">
          {requests.map((r) => {
            const fields = r.fields && typeof r.fields === "object" && !Array.isArray(r.fields)
              ? Object.entries(r.fields as Record<string, unknown>) : [];
            return (
              <li key={r.id} className="rounded-(--card-radius-inner) border border-card-edge bg-card-nested p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium capitalize">{r.kind.replaceAll("_", " ")}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">{listTime(r.createdAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{r.businessUnit || "Customer care"}</p>
                {fields.length > 0 ? (
                  <dl className="mt-2 grid gap-1.5 text-xs">
                    {fields.map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
                        <dt className="truncate capitalize text-muted-foreground">{key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")}</dt>
                        <dd className="break-words"><FieldValue value={value} /></dd>
                      </div>
                    ))}
                  </dl>
                ) : r.fields ? (
                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{JSON.stringify(r.fields, null, 2)}</pre>
                ) : null}
                <form action={updateCareRequest} className="mt-3 flex items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <label htmlFor={`request-status-${r.id}`} className="sr-only">Request status</label>
                  <NativeSelect wrapperClassName="flex-1" className="capitalize" id={`request-status-${r.id}`} name="status" defaultValue={r.status}>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="closed">Closed</option>
                  </NativeSelect>
                  <Button type="submit" size="xs" variant="outline">Save</Button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      {conversation.clerkUserId && (
        <form action={unlinkConversation} className="bg-card px-5 py-3">
          <input type="hidden" name="phone" value={conversation.phone} />
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start text-destructive hover:text-destructive">
            <Unlink /> Unlink website account
          </Button>
        </form>
      )}
    </div>
  );
}

export default async function CustomerCareInbox({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; page?: string; mode?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const rawPhone = query.phone?.replace(/[^\d]/g, "") || "";
  const phone = /^[1-9]\d{7,14}$/.test(rawPhone) ? rawPhone : null;
  const mode = ["bot", "human", "closed"].includes(query.mode || "")
    ? (query.mode as Mode)
    : undefined;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page || "1", 10) || 1),
  );
  const [
    [conversations, latestMessages],
    selectedRows,
    messages,
    contactRows,
    requests,
    failures,
  ] = await Promise.all([
    db
      .select()
      .from(careConversations)
      .where(mode ? eq(careConversations.mode, mode) : undefined)
      .orderBy(desc(careConversations.updatedAt))
      .limit(31)
      .offset((page - 1) * 30)
      .then(async (rows) => {
        const phones = rows.slice(0, 30).map((r) => r.phone);
        const latest = phones.length
          ? await db
              .selectDistinctOn([whatsappMessages.customerPhone])
              .from(whatsappMessages)
              .where(inArray(whatsappMessages.customerPhone, phones))
              .orderBy(whatsappMessages.customerPhone, desc(whatsappMessages.eventAt))
          : [];
        return [rows, latest] as const;
      }),
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
  ]);
  const latestByPhone = new Map(latestMessages.map((m) => [m.customerPhone, m]));
  const [selected] = selectedRows;
  const [contact] = contactRows;
  const canReply =
    !!contact && !contact.optedOutAt && hasServiceWindow(contact.lastInboundAt);
  const now = new Date();

  const chatHeader = selected && (
    <div className="flex items-center gap-3">
      <Link href={inboxHref({ mode, page })} aria-label="Back to chats"
        className="-ml-1 rounded-full p-1.5 text-muted-foreground hover:bg-muted lg:hidden">
        <ArrowLeft className="size-5" />
      </Link>
      <ChatAvatar mode={selected.mode} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate type-body-strong">+{selected.phone}</h2>
        <p className="truncate text-xs text-muted-foreground">
          {MODE_LABEL[selected.mode]} · {contact?.optedOutAt ? "Opted out" : canReply ? "Reply window open" : "Reply window closed"}
          {selected.assignedTo ? ` · ${selected.assignedTo}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-0.5">
        {([
          { m: "human", label: "Take over", Icon: UserRound },
          { m: "bot", label: "Resume assistant", Icon: Bot },
          { m: "closed", label: "Close conversation", Icon: CircleX },
        ] as const).map(({ m, label, Icon }) => (
          <form key={m} action={setConversationMode}>
            <input type="hidden" name="phone" value={selected.phone} />
            <input type="hidden" name="mode" value={m} />
            <Button type="submit" variant="ghost" size="icon-sm" aria-label={label} title={label}
              disabled={selected.mode === m}
              className={cn(selected.mode === m && "bg-brand-primary/25 text-foreground disabled:opacity-100")}>
              <Icon />
            </Button>
          </form>
        ))}
        <Sheet>
          <SheetTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Contact info" title="Contact info" className="xl:hidden" />}>
            <Info />
          </SheetTrigger>
          <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-sm">
            <SheetHeader className="border-b bg-brand-black text-brand-white">
              <SheetTitle className="text-brand-white">Contact info</SheetTitle>
            </SheetHeader>
            <ContactInfo conversation={selected} contact={contact} canReply={canReply} requests={requests} />
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100svh-var(--header-height))] min-h-[560px] overflow-hidden border-t bg-background md:h-[calc(100svh-var(--header-height)-1rem)] md:rounded-b-xl">
      {/* Chat list */}
      <aside aria-label="Conversations"
        className={cn("w-full min-w-0 flex-col border-r bg-card lg:flex lg:w-[360px] lg:shrink-0 xl:w-[400px]", phone ? "hidden" : "flex")}>
        <div className="bg-brand-black px-4 pb-3 pt-4 text-brand-white">
          <div className="flex items-center justify-between gap-2">
            <h1 className="type-section-title text-brand-white">Chats</h1>
            <Link href="/admin/customer-care/knowledge" title="Assistant knowledge"
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-brand-black-200 hover:bg-white/10 hover:text-brand-white">
              <BookOpen className="size-4" /> Knowledge
            </Link>
          </div>
          <form method="get" action="/admin/customer-care" className="relative mt-3">
            {mode && <input type="hidden" name="mode" value={mode} />}
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-black-300" />
            <input name="phone" type="search" inputMode="tel" defaultValue=""
              aria-label="Search by WhatsApp phone number" placeholder="Search phone number"
              className="h-9 w-full rounded-lg bg-white/10 pl-9 pr-3 text-sm text-brand-white outline-none placeholder:text-brand-black-300 focus-visible:ring-2 focus-visible:ring-brand-primary" />
          </form>
        </div>

        <nav aria-label="Conversation filter" className="flex gap-2 overflow-x-auto border-b px-4 py-2.5">
          {([undefined, "bot", "human", "closed"] as const).map((m) => {
            const active = mode === m;
            return (
              <Link key={m ?? "all"} href={inboxHref({ mode: m })} aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-sm transition-colors",
                  active ? "bg-brand-primary font-medium text-brand-black" : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}>
                {m ? MODE_LABEL[m] : "All"}
              </Link>
            );
          })}
        </nav>

        {failures.length > 0 && (
          <details className="group border-b">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="size-5" />
              </span>
              <span className="flex-1 font-medium">Queue attention</span>
              <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-brand-white">{failures.length}</span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <ul className="max-h-52 overflow-y-auto pb-2">
              {failures.map((j) => (
                <li key={j.id}>
                  <Link href={inboxHref({ phone: j.phone, mode, page })}
                    className="flex justify-between gap-2 px-4 py-1.5 pl-[4.5rem] text-xs hover:bg-muted/50">
                    <span className="font-medium">+{j.phone}</span>
                    <span className="truncate text-muted-foreground">{j.state} · {j.errorCode || "no code"} · {j.attempts} tries</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}

        <ul className="min-h-0 flex-1 overflow-y-auto">
          {conversations.slice(0, 30).map((c) => {
            const latest = latestByPhone.get(c.phone);
            const active = phone === c.phone;
            const awaitingStaff = c.mode === "human" && latest?.direction === "inbound";
            return (
              <li key={c.phone}>
                <Link href={inboxHref({ phone: c.phone, mode, page })} aria-current={active ? "true" : undefined}
                  className={cn("flex items-center gap-3 px-3 transition-colors hover:bg-muted/60", active && "bg-brand-primary/15 hover:bg-brand-primary/20")}>
                  <ChatAvatar mode={c.mode} />
                  <div className="min-w-0 flex-1 border-b py-3 pr-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate type-body-strong">+{c.phone}</span>
                      <span className={cn("shrink-0 text-xs", awaitingStaff ? "font-medium text-brand-accent dark:text-brand-primary" : "text-muted-foreground")}>
                        {listTime(latest?.eventAt ?? c.updatedAt, now)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="flex min-w-0 flex-1 items-center gap-1 truncate type-caption">
                        {latest?.direction === "outbound" && <CheckCheck aria-hidden className="size-4 shrink-0 opacity-70" />}
                        <span className="truncate">{latest ? previewText(latest) : "No messages yet"}</span>
                      </p>
                      {awaitingStaff
                        ? <span className="size-2.5 shrink-0 rounded-full bg-brand-primary ring-2 ring-brand-primary/30" title="Waiting for staff reply" />
                        : <ModePill mode={c.mode} />}
                    </div>
                    {c.businessUnit && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Tag aria-hidden className="size-3 text-brand-accent dark:text-brand-primary" /> {c.businessUnit}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
          {!conversations.length && (
            <li className="px-6 py-12 text-center text-sm text-muted-foreground">
              {mode ? `No ${MODE_LABEL[mode].toLowerCase()} conversations.` : "No conversations yet."}
            </li>
          )}
        </ul>

        {(page > 1 || conversations.length > 30) && (
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs">
            {page > 1 ? <Link className="hover:underline" href={inboxHref({ mode, page: page - 1 })}>← Newer</Link> : <span />}
            <span className="text-muted-foreground">Page {page}</span>
            {conversations.length > 30 ? <Link className="hover:underline" href={inboxHref({ mode, page: page + 1 })}>Older →</Link> : <span />}
          </div>
        )}
      </aside>

      {/* Conversation */}
      <section aria-label="Conversation" className={cn("min-w-0 flex-1 flex-col lg:flex", phone ? "flex" : "hidden")}>
        {selected ? (
          <CustomerCareThread key={selected.phone} phone={selected.phone} canReply={canReply}
            header={chatHeader}
            blockedReason={contact?.optedOutAt ? "This customer has opted out of WhatsApp messages." : "The 24-hour reply window is closed. Wait for the customer to message again."}
            replyId={randomUUID()}
            messages={[...messages].reverse().map((m) => ({ id: m.id, direction: m.direction,
              body: m.body, messageType: m.messageType, status: m.status, errorCode: m.errorCode,
              eventAt: m.eventAt.toISOString() }))} />
        ) : (
          <div className="care-wallpaper flex flex-1 flex-col items-center justify-center gap-4 border-b-4 border-brand-primary px-6 text-center">
            <span className="flex size-24 items-center justify-center rounded-full bg-card shadow-sm">
              <Image src="/calacot-logo-icon-black.png" alt="" width={56} height={56} className="dark:invert" />
            </span>
            <h2 className="type-page-title">Calacot Customer Care</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              {phone
                ? `No conversation found for +${phone}.`
                : "Choose a chat to read messages, take over from the assistant, and reply to customers."}
            </p>
            {phone && (
              <Link href={inboxHref({ mode, page })} className="text-sm underline lg:hidden">Back to chats</Link>
            )}
          </div>
        )}
      </section>

      {/* Contact info (wide screens) */}
      {selected && (
        <aside aria-label="Contact info" className="hidden w-[340px] shrink-0 flex-col overflow-y-auto border-l xl:flex">
          <div className="flex h-[57px] shrink-0 items-center border-b bg-card px-5 type-body-strong">Contact info</div>
          <ContactInfo conversation={selected} contact={contact} canReply={canReply} requests={requests} />
        </aside>
      )}
    </div>
  );
}
