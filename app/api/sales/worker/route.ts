import { workerAuthorized } from "@/lib/customer-care/security";
import { runSalesWorker } from "@/lib/sales/worker";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (
    !workerAuthorized(
      request.headers.get("authorization"),
      process.env.SALES_WORKER_SECRET,
    )
  )
    return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await runSalesWorker(5), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error("sales_worker_failure");
    return Response.json({ error: "Worker unavailable" }, { status: 503 });
  }
}
// Scheduler authentication is identical for GET and POST. No browser financial mutations here.
export const GET = POST;
