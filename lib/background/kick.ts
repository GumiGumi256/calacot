import { after } from "next/server";

/*
 * Immediate background delivery.
 *
 * Sales emails/WhatsApp (automation_outbox) and staff push notifications are durable: the external
 * once-a-minute schedulers (deployment/*-scheduler) recover anything missed and retry failures.
 * Waiting for the scheduler makes sending lag, so every successful admin write also starts the
 * workers right after its response. The queues' leases (FOR UPDATE SKIP LOCKED) make overlapping
 * runs with the scheduler safe.
 *
 * Within one server instance a worker never runs twice at once: a kick during a run asks for one
 * follow-up run, so a burst of writes costs at most two runs.
 */

type Worker = "sales" | "push";
const state: Record<Worker, { running: boolean; again: boolean }> = {
  sales: { running: false, again: false },
  push: { running: false, again: false },
};

async function runOnce(worker: Worker) {
  if (worker === "sales") {
    const { runSalesWorker } = await import("@/lib/sales/worker");
    await runSalesWorker(10);
  } else {
    if (!process.env.NEXT_PUBLIC_WEB_PUSH_KEY || !process.env.WEB_PUSH_PRIVATE_KEY) return;
    const { runPushWorker } = await import("@/lib/admin/push-worker");
    await runPushWorker();
  }
}

async function drain(worker: Worker) {
  const s = state[worker];
  if (s.running) {
    s.again = true;
    return;
  }
  s.running = true;
  try {
    do {
      s.again = false;
      try {
        await runOnce(worker);
      } catch (error) {
        console.error("background_kick_failed", {
          worker,
          code: error instanceof Error ? error.message.slice(0, 80) : "unknown",
        });
      }
    } while (s.again);
  } finally {
    s.running = false;
  }
}

/** Start the delivery workers after the current response. No-op outside a Next.js request. */
export function kickBackgroundWork() {
  if (!process.env.CALACOT_CLERK_ORG_ID) return;
  try {
    after(() => Promise.all([drain("sales"), drain("push")]));
  } catch {
    // Not in a request scope (scripts, tests): the schedulers deliver.
  }
}
