"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Send } from "lucide-react";
import { sendCareReply } from "@/lib/customer-care/admin-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Message, MessageContent, MessageHeader, MessageFooter } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { MessageScrollerProvider, MessageScroller, MessageScrollerViewport,
  MessageScrollerContent, MessageScrollerItem, MessageScrollerButton } from "@/components/ui/message-scroller";

export type InboxMessage = {
  id: string; direction: string; body: string | null; messageType: string;
  status: string | null; errorCode: string | null; eventAt: string;
};

function messageText(message: InboxMessage, history: InboxMessage[]) {
  if (message.direction === "inbound" && message.messageType === "interactive") {
    for (const previous of [...history].reverse()) {
      if (previous.direction !== "outbound" || previous.messageType !== "interactive") continue;
      try {
        const menu = JSON.parse(previous.body || "");
        for (const section of menu.action?.sections || []) {
          const option = section.rows?.find((row: { id: string; title: string }) => row.id === message.body);
          if (option) return option.title;
        }
      } catch { /* Older menu messages may contain plain text. */ }
    }
    return "Menu option selected";
  }
  if (message.messageType === "interactive" && message.body?.startsWith("{")) {
    try {
      const menu = JSON.parse(message.body);
      const options = menu.action?.sections?.flatMap((s: { rows?: { title: string }[] }) =>
        s.rows?.map((r) => r.title) || []) || [];
      return [menu.body?.text, ...options.map((t: string) => `• ${t}`)].filter(Boolean).join("\n");
    } catch { /* Display saved text when it is not a menu payload. */ }
  }
  return message.body || `[${message.messageType} message]`;
}

export function CustomerCareThread({ phone, messages, canReply, blockedReason, replyId: initialId }: {
  phone: string; messages: InboxMessage[]; canReply: boolean; blockedReason: string; replyId: string;
}) {
  const router = useRouter();
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
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Latest 80 messages · Updates every 15 seconds</p>
        <Button variant="outline" size="sm" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}>
          <RefreshCw data-icon="inline-start" /> Refresh
        </Button>
      </div>
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller className="h-[440px] rounded-lg border bg-muted/20 sm:h-[520px]" aria-label="WhatsApp conversation">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-4 p-4">
              {messages.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No messages in this conversation yet.</p>}
              {messages.map((m) => {
                const outgoing = m.direction === "outbound";
                return <MessageScrollerItem key={m.id} messageId={m.id}>
                  <Message align={outgoing ? "end" : "start"}>
                    <MessageContent className="max-w-[90%] sm:max-w-[80%]">
                      <MessageHeader>{outgoing ? "Calacot" : "Customer"}</MessageHeader>
                      <Bubble align={outgoing ? "end" : "start"} variant={outgoing ? "default" : "secondary"}>
                        <BubbleContent className="whitespace-pre-wrap break-words">{messageText(m, messages)}</BubbleContent>
                      </Bubble>
                      <MessageFooter className="flex-wrap gap-2">
                        <time dateTime={m.eventAt}>{new Date(m.eventAt).toLocaleString("en-GB", { timeZone: "Africa/Kampala", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                        {outgoing && <Badge variant={m.status === "failed" || m.status === "uncertain" ? "destructive" : "outline"}>{m.status || "queued"}</Badge>}
                        {m.errorCode && <span className="text-destructive">{m.errorCode}</span>}
                      </MessageFooter>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>;
              })}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <form action={action}>
        <input type="hidden" name="phone" value={phone} />
        <input type="hidden" name="replyId" value={replyId} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="care-reply">Reply to customer</FieldLabel>
            <Textarea id="care-reply" name="body" value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder="Write your reply…" rows={3} required maxLength={4096} disabled={!canReply || pending} />
            <FieldDescription>{canReply ? "Sending a reply takes over this conversation and pauses the assistant." : blockedReason}</FieldDescription>
          </Field>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{draft.length.toLocaleString()} / 4,096</span>
            <Button type="submit" disabled={!canReply || pending || !draft.trim()}>
              <Send data-icon="inline-start" /> {pending ? "Sending…" : "Send reply"}
            </Button>
          </div>
          {state.message && <p role="status" className="text-sm">{state.message}</p>}
        </FieldGroup>
      </form>
    </div>
  );
}
