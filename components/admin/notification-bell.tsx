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
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [pushError, setPushError] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/notifications", { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      const data: { items: Item[]; seen: string[]; pushPublicKey: string | null } = await response.json();
      setSeen(data.seen);
      setPushKey(data.pushPublicKey);
      setItems(data.items);
      setError(false);
    } catch { setError(true); }
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) void navigator.serviceWorker.getRegistration("/notification-worker.js").then(async r => {
      const sub = await r?.pushManager.getSubscription();
      if (!sub) return;
      const response = await fetch("/api/admin/notifications/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setSubscribed(response.ok);
    }).catch(() => setSubscribed(false));
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!panel.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  const mark = async (ids: string[]) => {
    const next = Array.from(new Set([...seen, ...ids])).slice(-300);
    setSeen(next);
    try {
      const response = await fetch("/api/admin/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
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
        const response = await fetch("/api/admin/notifications/subscription", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        if (!response.ok) throw new Error("Could not turn off push alerts.");
        await sub.unsubscribe(); setSubscribed(false); return;
      }
      if (!pushKey) throw new Error("Push alerts are not configured yet.");
      const key = Uint8Array.from(atob(pushKey.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - pushKey.length % 4) % 4)), c => c.charCodeAt(0));
      sub ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const response = await fetch("/api/admin/notifications/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!response.ok) throw new Error("Could not save this device. Please try again.");
      setSubscribed(true);
    } catch (e) { setPushError(e instanceof Error ? e.message : "Could not change push alerts."); }
  };
  const unread = items.filter(item => !seen.includes(item.id)).length;
  return <div className="relative" ref={panel}>
    <button type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} onClick={() => setOpen(!open)} className="relative inline-flex size-9 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <Bell className="size-4" />{unread > 0 && <span className="absolute right-0 top-0 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between border-b px-4 py-3"><div><p className="font-semibold">Notifications</p><p className="text-xs text-muted-foreground">{unread ? `${unread} unread` : "You’re all caught up"}</p></div><button type="button" onClick={() => mark(items.map(item => item.id))} disabled={!unread} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"><CheckCheck className="size-4" /> Mark all read</button></div>
      <button type="button" className="flex w-full items-center gap-2 border-b px-4 py-3 text-left text-xs hover:bg-accent" onClick={() => void togglePush()}><BellRing className="size-4 shrink-0" /> {subscribed ? "Turn off push alerts on this device" : "Enable push alerts on this device"}</button>
      {pushError && <p role="alert" className="px-4 py-2 text-xs text-destructive">{pushError}</p>}
      <div className="max-h-96 overflow-y-auto">{error ? <p role="status" className="p-4 text-sm text-muted-foreground">Notifications are unavailable. We’ll try again.</p> : items.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No recent notifications.</p> : items.map(item => <Link key={item.id} href={item.href} onClick={() => { mark([item.id]); setOpen(false); }} className="flex gap-3 border-b px-4 py-3 last:border-0 hover:bg-accent"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${seen.includes(item.id) ? "bg-transparent" : "bg-primary"}`} /><span className="min-w-0"><span className="block text-sm font-medium">{item.title}</span><span className="block text-xs text-muted-foreground">{item.description}</span><time className="mt-1 block text-xs text-muted-foreground" dateTime={item.at}>{new Date(item.at).toLocaleString()}</time></span></Link>)}</div>
    </div>}
  </div>;
}
