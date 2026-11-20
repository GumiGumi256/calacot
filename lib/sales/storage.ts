import "server-only";
import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
const hash = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
/** Minimal SigV4 private S3-compatible adapter. No public ACL or signed permanent URL. */
async function objectRequest(
  method: "PUT" | "GET",
  key: string,
  body?: Buffer,
  contentType = "application/pdf",
  createOnly = false,
) {
  if (!process.env.SALES_STORAGE_ENDPOINT) throw new Error("storage_configuration");
  const endpoint = new URL(process.env.SALES_STORAGE_ENDPOINT || "");
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password)
    throw new Error("storage_configuration");
  const bucket = process.env.SALES_STORAGE_BUCKET,
    keyId = process.env.SALES_STORAGE_ACCESS_KEY,
    secret = process.env.SALES_STORAGE_SECRET_KEY;
  if (!bucket || !keyId || !secret) throw new Error("storage_configuration");
  const region = process.env.SALES_STORAGE_REGION || "auto",
    service = "s3",
    date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""),
    day = date.slice(0, 8);
  const path = `/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const payload = hash(body || Buffer.alloc(0));
  // If-None-Match: * makes the PUT create-only (S3 and R2 conditional writes). It is signed.
  const conditional = method === "PUT" && createOnly;
  const canonicalHeaders = `host:${endpoint.host}\n${conditional ? "if-none-match:*\n" : ""}x-amz-content-sha256:${payload}\nx-amz-date:${date}\n`;
  const signed = conditional ? "host;if-none-match;x-amz-content-sha256;x-amz-date" : "host;x-amz-content-sha256;x-amz-date",
    scope = `${day}/${region}/${service}/aws4_request`;
  const canonical = [method, path, "", canonicalHeaders, signed, payload].join(
    "\n",
  );
  const hmac = (k: Buffer | string, v: string) =>
    createHmac("sha256", k).update(v).digest();
  const signing = hmac(
    hmac(hmac(hmac(`AWS4${secret}`, day), region), service),
    "aws4_request",
  );
  const signature = createHmac("sha256", signing)
    .update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`)
    .digest("hex");
  const response = await fetch(new URL(path, endpoint), {
    method,
    headers: {
      "x-amz-content-sha256": payload,
      "x-amz-date": date,
      Authorization: `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
      ...(method === "PUT" ? { "Content-Type": contentType } : {}),
      ...(conditional ? { "If-None-Match": "*" } : {}),
    },
    body: body ? new Uint8Array(body) : undefined,
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  // 412: an object already exists at this key. 409: a concurrent conditional write is in flight.
  if (conditional && (response.status === 412 || response.status === 409))
    throw new Error("artifact_exists");
  if (!response.ok)
    throw new Error(
      response.status === 404 ? "artifact_missing" : "storage_failure",
    );
  return response;
}
function localPath(key: string) {
  const root = resolve(process.cwd(), "tmp/sales-private"),
    target = resolve(/* turbopackIgnore: true */ root, key);
  if (!target.startsWith(root + sep)) throw new Error("invalid_storage_key");
  return target;
}
function localEnabled() {
  return (process.env.SALES_NOTIFICATION_MODE || "capture") === "capture";
}
/**
 * Create-only write: never replaces an existing artifact. Resolves "exists" when another writer
 * got there first; callers must then read the stored object back rather than trust their bytes.
 */
export async function storePdf(key: string, bytes: Buffer): Promise<"created" | "exists"> {
  if (bytes.length > 20 * 1024 * 1024) throw new Error("document_size_limit");
  if (localEnabled()) {
    const path = localPath(key);
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, bytes, { flag: "wx" });
      return "created";
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") return "exists";
      throw e;
    }
  }
  try {
    await objectRequest("PUT", key, bytes, "application/pdf", true);
    return "created";
  } catch (e) {
    if (e instanceof Error && e.message === "artifact_exists") return "exists";
    throw e;
  }
}
export async function loadPdf(key: string) {
  return localEnabled()
    ? readFile(localPath(key))
    : Buffer.from(await (await objectRequest("GET", key)).arrayBuffer());
}
/** Private evidence objects (Phase 1D expense receipts). Same adapter, never public. */
export async function storePrivateObject(key: string, bytes: Buffer, contentType: string, maxBytes = 10 * 1024 * 1024) {
  if (bytes.length > maxBytes) throw new Error("document_size_limit");
  if (localEnabled()) {
    const path = localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: "wx" }).catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code !== "EEXIST") throw e;
      },
    );
  } else await objectRequest("PUT", key, bytes, contentType);
}
export async function loadPrivateObject(key: string) {
  return loadPdf(key);
}
