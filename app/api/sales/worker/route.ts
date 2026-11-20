import { workerAuthorized } from "@/lib/customer-care/security";
import { runSalesWorker } from "@/lib/sales/worker";
import { expiringAdminData } from "@/lib/cache-tags";
export const maxDuration = 60;
async function handlePOST(request: Request) {
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
// Expire cached admin reads after a successful write (lib/cache-tags.ts).
export const POST = expiringAdminData(handlePOST);
// Scheduler authentication is identical for GET and POST. No browser financial mutations here.
export const GET = POST;
