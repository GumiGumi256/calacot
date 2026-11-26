export default {
  async scheduled(_event, env) {
    if (env.NOTIFICATION_WORKER_URL !== "https://www.calacot.com/api/notifications/worker" || !env.NOTIFICATION_WORKER_SECRET || env.NOTIFICATION_WORKER_SECRET.length < 32) throw new Error("notification_scheduler_configuration_invalid");
    const response = await fetch(env.NOTIFICATION_WORKER_URL, { method: "POST", headers: { authorization: `Bearer ${env.NOTIFICATION_WORKER_SECRET}` }, redirect: "manual", signal: AbortSignal.timeout(55000) });
    if (!response.ok) throw new Error(`notification_worker_http_${response.status}`);
    const result = await response.json();
    console.info("notification_worker_completed", result);
  },
};
