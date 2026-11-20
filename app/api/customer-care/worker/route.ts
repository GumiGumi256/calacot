import { workerAuthorized } from "@/lib/customer-care/security";
import { runCareWorker } from "@/lib/customer-care/worker";
import { expiringAdminData } from "@/lib/cache-tags";

export const maxDuration = 180;
async function handleWorker(request: Request, secret: string | undefined) {
  if (
    !workerAuthorized(
      request.headers.get("authorization"),
      secret,
    )
  )
    return new Response("Unauthorized", { status: 401 });
  try {
    const result = await runCareWorker(5);
    console.info("customer_care_worker_completed", result);
    return Response.json(result);
  } catch {
    console.error("customer_care_worker_failed");
    return Response.json({ error: "Worker unavailable" }, { status: 503 });
  }
}

// Vercel cron invokes GET with Authorization: Bearer <CRON_SECRET>.
async function handleGET(request: Request) {
  return handleWorker(request, process.env.CRON_SECRET);
}

async function handlePOST(request: Request) {
  return handleWorker(request, process.env.CUSTOMER_CARE_WORKER_SECRET);
}

// Expire cached admin reads after a successful write (lib/cache-tags.ts).
export const GET = expiringAdminData(handleGET);

// Expire cached admin reads after a successful write (lib/cache-tags.ts).
export const POST = expiringAdminData(handlePOST);
