import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const url = process.env.CUSTOMER_CARE_WORKER_URL;
  const secret = process.env.CUSTOMER_CARE_WORKER_SECRET;
  if (!url || !secret)
    throw new Error(
      "CUSTOMER_CARE_WORKER_URL and CUSTOMER_CARE_WORKER_SECRET are required",
    );
  const target = new URL(url);
  if (
    target.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(target.hostname)
  )
    throw new Error("Worker URL requires HTTPS");
  const response = await fetch(target, {
    method: "POST",
    redirect: "error",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(175_000),
  });
  if (!response.ok) throw new Error(`Worker returned HTTP ${response.status}`);
  console.log(await response.text());
}
void main();
