export async function invokeCareWorker(env, request = fetch) {
  const target = new URL(env.CUSTOMER_CARE_WORKER_URL);
  if (target.href !== "https://www.calacot.com/api/customer-care/worker" ||
      !env.CUSTOMER_CARE_WORKER_SECRET || env.CUSTOMER_CARE_WORKER_SECRET.length < 32)
    throw new Error("care_scheduler_configuration_invalid");
  const response = await request(target, {
    method: "POST",
    redirect: "error",
    headers: { authorization: `Bearer ${env.CUSTOMER_CARE_WORKER_SECRET}` },
    signal: AbortSignal.timeout(175000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`care_worker_http_${response.status}`);
  }
  const result = await response.json();
  if (result.disabled) throw new Error("care_worker_disabled");
  console.info("care_scheduler_completed", { processed: result.processed });
}

const scheduler = {
  async scheduled(_controller, env) {
    await invokeCareWorker(env);
  },
};

export default scheduler;
