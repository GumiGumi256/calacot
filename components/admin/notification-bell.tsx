"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, CheckCheck } from "lucide-react";

type Item = { id: string; at: string; title: string; description: string; href: string };

export function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  // Known at build time, so push setup does not depend on the feed request succeeding.
  const [pushKey, setPushKey] = useState<string | null>(process.env.NEXT_PUBLIC_WEB_PUSH_KEY || null);
  const [subscribed, setSubscribed] = useState(false);
  const [pushError, setPushError] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      const data: { items: Item[]; seen: string[]; pushPublicKey: string | null } = await response.json();
      setSeen(data.seen);
      if (data.pushPublicKey) setPushKey(data.pushPublicKey);
      setItems(data.items);
      setError(false);
    } catch { setError(true); }
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) void navigator.serviceWorker.getRegistration("/notification-worker.js").then(async r => {
      const sub = await r?.pushManager.getSubscription();
      if (!sub) return;
      const response = await fetch("/api/notifications/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setSubscribed(response.ok);
    }).catch(() => setSubscribed(false));
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  const mark = async (ids: string[]) => {
    const next = Array.from(new Set([...seen, ...ids])).slice(-300);
    setSeen(next);
    try {
      const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
      if (!response.ok) throw new Error();
    } catch { setError(true); void refresh(); }
  };
  const togglePush = async () => {
    setPushError("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("Push alerts are not supported in this browser.");
      if (!subscribed && !pushKey) throw new Error("Push alerts are not configured yet.");
      if (!subscribed && await Notification.requestPermission() !== "granted") throw new Error("Allow notifications in your browser settings to enable alerts.");
      const registration = await navigator.serviceWorker.register("/notification-worker.js");
      let sub = await registration.pushManager.getSubscription();
      if (subscribed && sub) {
        const response = await fetch("/api/notifications/subscription", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        if (!response.ok) throw new Error("Could not turn off push alerts.");
        await sub.unsubscribe(); setSubscribed(false); return;
      }
      if (!pushKey) throw new Error("Push alerts are not configured yet.");
      const key = Uint8Array.from(atob(pushKey.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - pushKey.length % 4) % 4)), c => c.charCodeAt(0));
      sub ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const response = await fetch("/api/notifications/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!response.ok) throw new Error("Could not save this device. Please try again.");
      setSubscribed(true);
    } catch (e) { setPushError(e instanceof Error ? e.message : "Could not change push alerts."); }
  };
  const unread = items.filter(item => !seen.includes(item.id)).length;
  // Only offer push when this browser supports it and the site has a push key (or the device is already subscribed).
  const pushAvailable = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && (!!pushKey || subscribed);
  return <div className="relative" ref={panel}>
    <button type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} onClick={() => setOpen(!open)} className="relative inline-flex size-9 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <Bell className="size-4" />{unread > 0 && <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs leading-none font-bold text-primary-foreground">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {/* Phones: a sheet pinned under the header, inset from both screen edges. Larger screens: a dropdown under the bell. */}
    {open && <div role="dialog" aria-label="Notifications" className="fixed inset-x-3 top-16 z-50 flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-xl border border-card-edge bg-brand-white text-foreground shadow-(--elevation-3) dark:bg-popover dark:text-popover-foreground sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:max-h-[32rem] sm:w-96">
      <div className="flex items-center justify-between gap-3 border-b border-card-edge bg-brand-primary-50 px-4 py-3 dark:bg-brand-primary-950/40">
        <div className="min-w-0"><p className="font-semibold">Notifications</p><p className="text-xs text-muted-foreground">{error ? "Couldn’t refresh" : unread ? `${unread} unread` : "You’re all caught up"}</p></div>
        <button type="button" onClick={() => mark(items.map(item => item.id))} disabled={!unread} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-brand-primary-100 hover:text-foreground disabled:pointer-events-none dark:hover:bg-accent disabled:opacity-50"><CheckCheck className="size-4" aria-hidden="true" /> Mark all read</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {error && items.length === 0 ? <div role="status" className="flex flex-col items-center gap-3 p-6 text-center text-sm text-muted-foreground"><p>Notifications couldn’t be loaded.</p><button type="button" onClick={() => void refresh()} className="min-h-9 rounded-md border border-card-edge px-3 text-foreground hover:bg-brand-primary-100 dark:hover:bg-accent">Try again</button></div>
          : items.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No recent notifications.</p>
          : <ul>{items.map(item => <li key={item.id} className={`border-b border-card-edge last:border-0 ${seen.includes(item.id) ? "" : "bg-brand-primary-50/60 dark:bg-brand-primary-950/30"}`}><Link href={item.href} onClick={() => { void mark([item.id]); setOpen(false); }} className="flex min-h-14 gap-3 px-4 py-3 hover:bg-brand-primary-100/60 focus-visible:bg-brand-primary-100/60 focus-visible:outline-none dark:hover:bg-accent dark:focus-visible:bg-accent">
              <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${seen.includes(item.id) ? "bg-transparent" : "bg-primary"}`} />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.title}{!seen.includes(item.id) && <span className="sr-only"> (unread)</span>}</span><span className="block text-xs break-words text-muted-foreground">{item.description}</span><time className="mt-1 block text-xs text-muted-foreground" dateTime={item.at} title={new Date(item.at).toLocaleString()}>{ago(item.at)}</time></span>
            </Link></li>)}</ul>}
      </div>
      {pushAvailable && <div className="border-t border-card-edge">
        <button type="button" className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-xs text-muted-foreground hover:bg-brand-primary-100/60 hover:text-foreground dark:hover:bg-accent" onClick={() => void togglePush()}><BellRing className="size-4 shrink-0" aria-hidden="true" /> {subscribed ? "Turn off push alerts on this device" : "Get push alerts on this device"}</button>
        {pushError && <p role="alert" className="px-4 pb-3 text-xs text-destructive">{pushError}</p>}
      </div>}
    </div>}
  </div>;
}

/** "Just now", "5 min ago", "3 hr ago", "2 days ago". */
function ago(at: string) {
  const seconds = Math.round((Date.parse(at) - Date.now()) / 1000);
  if (Number.isNaN(seconds)) return "";
  if (seconds > -60) return "Just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
  for (const [unit, size] of [["minute", 60], ["hour", 3600], ["day", 86400]] as const) {
    const next = unit === "minute" ? 3600 : unit === "hour" ? 86400 : Infinity;
    if (-seconds < next) return rtf.format(Math.round(seconds / size), unit);
  }
  return "";
}
