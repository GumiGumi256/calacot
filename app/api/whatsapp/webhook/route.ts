export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!expectedToken) {
    return new Response("WHATSAPP_VERIFY_TOKEN is missing", {
      status: 500,
    });
  }

  if (mode === "subscribe" && token === expectedToken && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Verification failed", { status: 403 });
}

export async function POST() {
  return new Response("EVENT_RECEIVED", { status: 200 });
}