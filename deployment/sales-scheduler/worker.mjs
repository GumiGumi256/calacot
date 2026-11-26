export async function invokeSalesWorker(env, request = fetch) {
  const target = new URL(env.SALES_WORKER_URL);
  if (target.href !== "https://www.calacot.com/api/sales/worker" ||
      !env.SALES_WORKER_SECRET || env.SALES_WORKER_SECRET.length < 32)
    throw new Error("sales_scheduler_configuration_invalid");
  const response = await request(target, {
    method: "POST",
    redirect: "manual",
    headers: { authorization: `Bearer ${env.SALES_WORKER_SECRET}` },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`sales_worker_http_${response.status}`);
  }
  const result = await response.json();
  console.info("sales_scheduler_completed", { processed: result.processed });
}

export default {
  async scheduled(_controller, env) {
    await invokeSalesWorker(env);
  },
};
