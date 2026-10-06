import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const directory = await mkdtemp(join(process.cwd(), "tmp-care-replies-"));
const context = {
  contact: { lastInboundAt: new Date(), optedOutAt: null },
  message: null, sends: 0, authorized: true, outcome: "sent", mutations: 0,
};
globalThis.__careReplyTest = context;
try {
  const bundle = await build({
    entryPoints: ["lib/customer-care/admin-actions.ts"], bundle: true, platform: "node",
    format: "esm", write: false, packages: "external",
    plugins: [{ name: "reply-test-adapters", setup(builder) {
      builder.onResolve({ filter: /^drizzle-orm(?:\/pg-core)?$/ }, ({ path }) => ({ path, external: true }));
      builder.onResolve({ filter: /^(server-only|next\/cache|@\/database\/db|@\/lib\/design-purchases\/permissions|\.\/worker)$/ },
        ({ path }) => ({ path, namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => {
        const prefix = "const c=globalThis.__careReplyTest;";
        if (path === "server-only") return { contents: "", loader: "js" };
        if (path === "next/cache") return { contents: "export function revalidatePath(){}", loader: "js" };
        if (path.includes("permissions")) return { contents: prefix + 'export async function requireAdmin(){if(!c.authorized)throw Error("unauthorized");return "staff";}', loader: "js" };
        if (path === "./worker") return { contents: prefix + 'export async function deliverCareMessage(){c.sends++;c.message.status=c.outcome;}', loader: "js" };
        return { loader: "js", contents: prefix + `
          import { getTableName } from "drizzle-orm";
          export const db={
            select(){return {from(t){return {where(){return Promise.resolve(getTableName(t)==='whatsapp_contacts'?[c.contact]:c.message?[c.message]:[])}}}}},
            update(){return {set(){c.mutations++;return {where:async()=>[]}}}},
            insert(t){return {values(v){return {onConflictDoNothing(){return {returning:async()=>{
              if(c.message)return [];c.message={...v};return [c.message];
            }}},then(resolve){return Promise.resolve([]).then(resolve)}}}}}
          };
        ` };
      });
    } }],
  });
  // Keep package resolution relative to the workspace while storing the bundle in temp.
  const { createRequire } = await import("node:module");
  const require = createRequire(pathToFileURL(join(process.cwd(), "package.json")));
  let source = bundle.outputFiles[0].text.replaceAll('from "drizzle-orm"', `from ${JSON.stringify(pathToFileURL(require.resolve("drizzle-orm")).href)}`)
    .replaceAll('from "drizzle-orm/pg-core"', `from ${JSON.stringify(pathToFileURL(require.resolve("drizzle-orm/pg-core")).href)}`)
    .replaceAll('from "zod"', `from ${JSON.stringify(pathToFileURL(require.resolve("zod")).href)}`);
  const file = join(directory, "actions.mjs");
  await writeFile(file, source);
  const { sendCareReply } = await import(pathToFileURL(file).href);
  const form = (body = "Thanks for your message.") => {
    const data = new FormData(); data.set("phone", "256700000001");
    data.set("replyId", "00000000-0000-4000-8000-000000000001"); data.set("body", body); return data;
  };
  const state = { ok: false, message: "" };
  context.authorized = false;
  await assert.rejects(() => sendCareReply(state, form()), /unauthorized/);
  context.authorized = true;
  assert.equal((await sendCareReply(state, form(" "))).ok, false);
  assert.equal((await sendCareReply(state, form("x".repeat(4097)))).ok, false);
  context.contact.optedOutAt = new Date();
  assert.equal((await sendCareReply(state, form())).ok, false);
  context.contact.optedOutAt = null;
  context.contact.lastInboundAt = new Date(Date.now() - 25 * 3600000);
  assert.equal((await sendCareReply(state, form())).ok, false);
  assert.equal(context.mutations, 0);
  context.contact.lastInboundAt = new Date();
  assert.equal((await sendCareReply(state, form())).ok, true);
  assert.equal(context.message.body, "Thanks for your message.");
  assert.equal((await sendCareReply(state, form())).ok, true);
  assert.equal(context.sends, 1);
  context.message = null; context.outcome = "uncertain";
  assert.match((await sendCareReply(state, form())).message, /uncertain/);
  await sendCareReply(state, form());
  assert.equal(context.sends, 2);
  console.log("PASS: staff authorization, reply validation, opt-out/window enforcement, free-text sending, replay deduplication and uncertain delivery feedback.");
} finally {
  delete globalThis.__careReplyTest;
  assert.ok(directory.startsWith(join(process.cwd(), "tmp-care-replies-")));
  await rm(directory, { recursive: true, force: true });
}
