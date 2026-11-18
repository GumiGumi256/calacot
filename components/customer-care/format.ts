// Shared display helpers for the customer-care inbox. Safe on server and client.

const TZ = "Africa/Kampala";

function dayKey(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function timeOfDay(date: Date) {
  return date.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

/** WhatsApp-style relative day: Today, Yesterday, weekday, or a date. */
export function dayLabel(date: Date, now = new Date()) {
  const key = dayKey(date);
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  const ageDays = (now.getTime() - date.getTime()) / 86_400_000;
  if (ageDays < 7) return date.toLocaleDateString("en-GB", { timeZone: TZ, weekday: "long" });
  return date.toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
}

export { dayKey };

/** Chat-list timestamp: time today, "Yesterday", weekday, or short date. */
export function listTime(date: Date, now = new Date()) {
  const label = dayLabel(date, now);
  if (label === "Today") return timeOfDay(date);
  if (label === "Yesterday" || !/\d/.test(label)) return label;
  return date.toLocaleDateString("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit" });
}

export type ParsedMessage = { text: string; options: string[] };

type MessageLike = { direction: string; messageType: string; body: string | null };

/** Turns stored WhatsApp payloads into displayable text and menu options. */
export function parseMessage(message: MessageLike, history: MessageLike[] = []): ParsedMessage {
  if (message.direction === "inbound" && message.messageType === "interactive") {
    for (const previous of [...history].reverse()) {
      if (previous.direction !== "outbound" || previous.messageType !== "interactive") continue;
      try {
        const menu = JSON.parse(previous.body || "");
        for (const section of menu.action?.sections || []) {
          const option = section.rows?.find((row: { id: string; title: string }) => row.id === message.body);
          if (option) return { text: option.title, options: [] };
        }
      } catch { /* Older menu messages may contain plain text. */ }
    }
    return { text: "Menu option selected", options: [] };
  }
  if (message.messageType === "interactive" && message.body?.startsWith("{")) {
    try {
      const menu = JSON.parse(message.body);
      const options: string[] = menu.action?.sections?.flatMap((s: { rows?: { title: string }[] }) =>
        s.rows?.map((r) => r.title) || []) || [];
      return { text: menu.body?.text || "", options };
    } catch { /* Display saved text when it is not a menu payload. */ }
  }
  if (message.messageType === "template" && !message.body) return { text: "Template message", options: [] };
  if (message.messageType === "document" && !message.body) return { text: "📄 Document", options: [] };
  return { text: message.body || `[${message.messageType} message]`, options: [] };
}

export function previewText(message: MessageLike) {
  const { text, options } = parseMessage(message);
  const line = (text || (options.length ? "Menu" : "")).split("\n")[0];
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

export const MODE_LABEL: Record<string, string> = { bot: "Assistant", human: "Staff", closed: "Closed" };
