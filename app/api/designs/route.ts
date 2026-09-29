import { getDesignCollection } from "@/lib/queries/design";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") ?? "";
  const search = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const rawOffset = request.nextUrl.searchParams.get("offset") ?? "0";
  const offset = Number(rawOffset);
  if (!/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset > 100_000 || type.length > 100 || search.length > 120) {
    return Response.json({ error: "Invalid collection parameters." }, { status: 400 });
  }
  try {
    return Response.json(await getDesignCollection(type, offset, search));
  } catch (error) {
    console.error("Unable to load design collection", error);
    return Response.json({ error: "Designs are temporarily unavailable." }, { status: 503 });
  }
}
