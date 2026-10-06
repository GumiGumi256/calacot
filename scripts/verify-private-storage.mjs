import {config} from "dotenv";
import {build} from "esbuild";
import {mkdir} from "node:fs/promises";
import {createRequire} from "node:module";
import {randomUUID,createHash} from "node:crypto";
import assert from "node:assert/strict";
import {PDFDocument} from "pdf-lib";
config({path:[".env.local",".env"],quiet:true});
// This process calls storage only. It never imports a worker or changes env files.
process.env.SALES_NOTIFICATION_MODE="staging";
await mkdir("tmp/storage-test",{recursive:true});
await build({entryPoints:["lib/sales/storage.ts"],outfile:"tmp/storage-test/storage.cjs",bundle:true,platform:"node",format:"cjs",packages:"external",plugins:[{name:"server-only-marker",setup(b){b.onResolve({filter:/^server-only$/},()=>({path:"empty",namespace:"marker"}));b.onLoad({filter:/.*/,namespace:"marker"},()=>({contents:""}));}}]});
const {storePdf,loadPdf}=createRequire(import.meta.url)("../tmp/storage-test/storage.cjs");
try {
  const document=await PDFDocument.create();
  document.addPage().drawText("Calacot private storage connectivity test. No customer data.");
  const bytes=Buffer.from(await document.save());
  const key=`commercial/storage-check/${randomUUID()}.pdf`;
  await storePdf(key,bytes);
  const recovered=await loadPdf(key);
  const hash=b=>createHash("sha256").update(b).digest("hex");
  assert.equal(hash(recovered),hash(bytes));
  const endpoint=new URL(process.env.SALES_STORAGE_ENDPOINT);
  const response=await fetch(new URL(`/${process.env.SALES_STORAGE_BUCKET}/${key}`,endpoint),{signal:AbortSignal.timeout(20000)});
  // R2's S3 endpoint may reject unsigned requests with 400 rather than 403.
  assert.ok([400,401,403].includes(response.status),`Unexpected anonymous response: ${response.status}`);
  assert.ok(!(await response.arrayBuffer()).byteLength || response.headers.get("content-type") !== "application/pdf", "Anonymous endpoint returned PDF content");
  console.log(`PASS: PDF upload/readback checksums match; anonymous read denied (${response.status}).`);
  console.log(`Non-customer test artifact retained: ${key}`);
} catch(error) {
  console.error("Storage check failed:",error instanceof Error?error.message:"unknown_error");
  process.exitCode=1;
}
