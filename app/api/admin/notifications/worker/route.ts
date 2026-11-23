import { workerAuthorized } from "@/lib/customer-care/security";
import { runPushWorker } from "@/lib/admin/push-worker";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!workerAuthorized(request.headers.get("authorization"), process.env.NOTIFICATION_WORKER_SECRET)) return new Response("Unauthorized", { status: 401 });
  try { return Response.json(await runPushWorker(), { headers: { "Cache-Control": "no-store" } }); }
  catch { console.error("notification_worker_failed"); return new Response("Worker unavailable", { status: 503 }); }
}
