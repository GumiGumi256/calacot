"use client";

import { Fragment, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, CheckCheck, Clock, List, Lock, RefreshCw, SendHorizontal } from "lucide-react";
import { sendCareReply } from "@/lib/customer-care/admin-actions";
import { Button } from "@/components/ui/button";
import { MessageScrollerProvider, MessageScroller, MessageScrollerViewport,
  MessageScrollerContent, MessageScrollerItem, MessageScrollerButton } from "@/components/ui/message-scroller";
import { dayKey, dayLabel, parseMessage, timeOfDay } from "@/components/customer-care/format";
import { cn } from "@/lib/utils";

export type InboxMessage = {
  id: string; direction: string; body: string | null; messageType: string;
  status: string | null; errorCode: string | null; eventAt: string;
};

function StatusTick({ status }: { status: string | null }) {
  switch (status) {
    case "read":
      return <CheckCheck aria-label="Read" className="size-4 text-brand-accent dark:text-brand-primary" />;
    case "delivered":
      return <CheckCheck aria-label="Delivered" className="size-4 opacity-60" />;
    case "sent":
      return <Check aria-label="Sent" className="size-4 opacity-60" />;
    case "failed":
    case "uncertain":
      return <AlertCircle aria-label={status === "failed" ? "Failed" : "Delivery uncertain"} className="size-3.5 text-destructive" />;
    default:
      return <Clock aria-label={status || "Queued"} className="size-3 opacity-60" />;
  }
}

export function CustomerCareThread({ phone, messages, canReply, blockedReason, replyId: initialId, header }: {
  phone: string; messages: InboxMessage[]; canReply: boolean; blockedReason: string; replyId: string;
  header?: React.ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [refreshing, startRefresh] = useTransition();
  const [draft, setDraft] = useState("");
  const [replyId, setReplyId] = useState(initialId);
  const [state, action, pending] = useActionState(async (previous: { ok: boolean; message: string }, data: FormData) => {
    const result = await sendCareReply(previous, data);
    if (result.ok) {
      setDraft("");
      setReplyId(crypto.randomUUID());
      router.refresh();
    }
    return result;
  }, { ok: false, message: "" });
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") startRefresh(() => router.refresh());
    }, 15000);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex items-center gap-2 border-b bg-card px-3 py-2 sm:px-4">
        <div className="min-w-0 flex-1">{header}</div>
        <Button variant="ghost" size="icon-sm" disabled={refreshing} aria-label="Refresh conversation"
          title="Refresh (auto-updates every 15 seconds)" onClick={() => startRefresh(() => router.refresh())}>
          <RefreshCw className={cn(refreshing && "animate-spin")} />
        </Button>
      </div>

      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller className="care-wallpaper min-h-0 flex-1" aria-label="WhatsApp conversation">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-1 px-3 py-4 sm:px-[6%]">
              <p className="mx-auto mb-3 flex max-w-sm items-center gap-1.5 rounded-lg bg-brand-primary/25 px-3 py-1.5 text-center text-xs leading-snug text-brand-black-700 dark:text-brand-black-200 shadow-xs dark:bg-brand-primary/15">
                <Lock className="size-3 shrink-0" />
                Showing the latest 80 messages. New messages appear automatically.
              </p>
              {messages.length === 0 && (
                <p className="mx-auto mt-10 rounded-lg bg-card px-4 py-2 text-sm text-muted-foreground shadow-xs">
                  No messages in this conversation yet.
                </p>
              )}
              {messages.map((m, index) => {
                const outgoing = m.direction === "outbound";
                const date = new Date(m.eventAt);
                const previous = messages[index - 1];
                const newDay = !previous || dayKey(new Date(previous.eventAt)) !== dayKey(date);
                const firstInGroup = newDay || previous.direction !== m.direction;
                const { text, options } = parseMessage(m, messages.slice(0, index));
                const failed = m.status === "failed" || m.status === "uncertain";
                return (
                  <Fragment key={m.id}>
                    {newDay && (
                      <div className="sticky top-2 z-10 my-2 flex justify-center">
                        <span className="rounded-lg bg-card px-3 py-1 type-eyebrow text-muted-foreground shadow-xs">
                          {dayLabel(date)}
                        </span>
                      </div>
                    )}
                    <MessageScrollerItem messageId={m.id}
                      className={cn("flex", outgoing ? "justify-end" : "justify-start", firstInGroup && "mt-2")}>
                      <div className={cn(
                        "relative max-w-[85%] rounded-lg text-sm shadow-xs sm:max-w-[65%]",
                        outgoing
                          ? "bg-[color-mix(in_oklch,var(--color-brand-primary)_32%,white)] text-brand-black dark:bg-[color-mix(in_oklch,var(--color-brand-primary)_22%,var(--color-brand-black))] dark:text-foreground"
                          : "bg-card text-card-foreground",
                        firstInGroup && (outgoing ? "rounded-tr-none" : "rounded-tl-none"),
                        failed && "ring-1 ring-destructive/50",
                      )}>
                        {firstInGroup && (
                          <span aria-hidden className={cn(
                            "absolute top-0 size-2.5",
                            outgoing
                              ? "-right-2 bg-[color-mix(in_oklch,var(--color-brand-primary)_32%,white)] [clip-path:polygon(0_0,100%_0,0_100%)] dark:bg-[color-mix(in_oklch,var(--color-brand-primary)_22%,var(--color-brand-black))]"
                              : "-left-2 bg-card [clip-path:polygon(0_0,100%_0,100%_100%)]",
                          )} />
                        )}
                        <span className="sr-only">{outgoing ? "Calacot:" : "Customer:"}</span>
                        <div className="px-2.5 pb-1.5 pt-1.5">
                          {text && (
                            <span className="whitespace-pre-wrap break-words">
                              {text}
                              {/* Spacer so the timestamp never overlaps the last line. */}
                              <span aria-hidden className={cn("inline-block", outgoing ? "w-[4.5rem]" : "w-11")} />
                            </span>
                          )}
                          <span className="float-right -mb-1 ml-2 mt-1.5 flex items-center gap-1 text-xs leading-none text-brand-black-600 dark:text-brand-black-300">
                            <time dateTime={m.eventAt}>{timeOfDay(date)}</time>
                            {outgoing && <StatusTick status={m.status} />}
                          </span>
                        </div>
                        {options.length > 0 && (
                          <ul className="border-t border-foreground/10">
                            {options.map((option) => (
                              <li key={option} className="flex items-center justify-center gap-2 border-b border-foreground/10 px-3 py-2 text-center text-sm font-medium text-brand-accent last:border-b-0 dark:text-brand-primary">
                                <List className="size-3.5 shrink-0" />{option}
                              </li>
                            ))}
                          </ul>
                        )}
                        {(failed || m.errorCode) && (
                          <p className="border-t border-destructive/20 px-2.5 py-1 text-xs text-destructive">
                            {m.status === "uncertain" ? "Delivery uncertain" : "Not delivered"}{m.errorCode ? ` · ${m.errorCode}` : ""}
                          </p>
                        )}
                      </div>
                    </MessageScrollerItem>
                  </Fragment>
                );
              })}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="border-t bg-muted/60 px-3 py-2.5 sm:px-4">
        {canReply ? (
          <form ref={formRef} action={action} className="flex items-end gap-2">
            <input type="hidden" name="phone" value={phone} />
            <input type="hidden" name="replyId" value={replyId} />
            <label htmlFor="care-reply" className="sr-only">Reply to customer</label>
            <textarea id="care-reply" name="body" value={draft} rows={1} required maxLength={4096} disabled={pending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (draft.trim() && !pending) formRef.current?.requestSubmit();
                }
              }}
              placeholder="Type a message"
              aria-describedby="care-reply-hint"
              className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none rounded-3xl border-0 bg-card px-4 py-2.5 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand-primary disabled:opacity-60" />
            <Button type="submit" size="icon" aria-label={pending ? "Sending" : "Send reply"}
              disabled={pending || !draft.trim()}
              className="shrink-0 rounded-full bg-brand-primary text-brand-black hover:bg-brand-primary/85">
              <SendHorizontal />
            </Button>
          </form>
        ) : (
          <p className="flex items-center justify-center gap-2 rounded-lg bg-card px-4 py-3 text-center text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" /> {blockedReason}
          </p>
        )}
        <div id="care-reply-hint" className="mt-1.5 flex min-h-4 items-center justify-between gap-3 px-2 text-xs text-muted-foreground">
          <span role="status" className={cn(state.message && !state.ok && "text-destructive")}>
            {state.message || (canReply ? "Enter to send · Shift+Enter for a new line · Replying takes over from the assistant" : "")}
          </span>
          {canReply && draft.length > 3500 && <span>{draft.length.toLocaleString()} / 4,096</span>}
        </div>
      </div>
    </div>
  );
}
