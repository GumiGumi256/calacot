import { workerAuthorized } from "@/lib/customer-care/security";
import { runCareWorker } from "@/lib/customer-care/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function POST(request: Request) {
  if (
    !workerAuthorized(
      request.headers.get("authorization"),
      process.env.CUSTOMER_CARE_WORKER_SECRET,
    )
  )
    return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await runCareWorker(2));
  } catch {
    return Response.json({ error: "Worker unavailable" }, { status: 503 });
  }
}
