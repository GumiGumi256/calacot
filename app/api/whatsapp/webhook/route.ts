import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

// Meta calls this when you click "Verify and save".
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    return new Response("Verify token is not configured", {
      status: 500,
    });
  }

  if (
    mode !== "subscribe" ||
    token !== verifyToken ||
    !challenge
  ) {
    return new Response("Verification failed", { status: 403 });
  }

  // Return the challenge as plain text, not JSON.
  return new Response(challenge, {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
    },
  });
}

// Meta sends incoming messages and delivery updates here.
export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    return new Response("App secret is not configured", {
      status: 500,
    });
  }

  const signature = request.headers.get("x-hub-signature-256");

  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Verify the original request bytes before parsing JSON.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const expectedSignature = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest();

  const receivedSignature = Buffer.from(signature.slice(7), "hex");

  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: unknown;

  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (
    typeof event !== "object" ||
    event === null ||
    !("object" in event) ||
    event.object !== "whatsapp_business_account"
  ) {
    return new Response("Unsupported event", { status: 404 });
  }

  // Setup only: confirms receipt without logging customer content.
  // Add durable message storage or queueing here before using
  // this endpoint for customer conversations.
  console.info("Verified WhatsApp webhook received");

  return new Response("EVENT_RECEIVED", { status: 200 });
}