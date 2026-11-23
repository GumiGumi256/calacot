self.addEventListener("push", event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Use a generic message. */ }
  event.waitUntil(self.registration.showNotification("Calacot", {
    body: typeof data.body === "string" ? data.body : "You have a new notification.",
    icon: "/calacot-logo.png",
    tag: typeof data.id === "string" ? data.id : "calacot-notification",
    data: { url: "/admin/dashboard" },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(async windows => {
    const existing = windows.find(window => new URL(window.url).origin === self.location.origin);
    if (existing) { await existing.focus(); return; }
    await clients.openWindow("/admin/dashboard");
  }));
});
