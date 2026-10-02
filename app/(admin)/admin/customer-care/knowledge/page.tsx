import Link from "next/link";
import { requireAdmin } from "@/lib/design-purchases/permissions";
import { client } from "@/sanity/lib/client";
import {
  prepareCompanyProfile,
  prepareKnowledgeDraft,
} from "@/lib/customer-care/knowledge-actions";
import { businessUnits, intents } from "@/lib/customer-care/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export const dynamic = "force-dynamic";
export const metadata = { title: "Customer care knowledge" };
export default async function KnowledgeManagement() {
  await requireAdmin();
  const entries = await client
    .fetch<
      {
        _id: string;
        title: string;
        approvalStatus: string;
        active: boolean;
        businessUnit: string;
        version: number;
      }[]
    >(`*[_type=="customerCareKnowledge"] | order(_updatedAt desc)[0...100] {_id,title,approvalStatus,active,businessUnit,version}`, {}, { perspective: "published", useCdn: false, cache: "no-store" })
    .catch(() => []);
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 pb-20 pt-28">
      <Link href="/admin/customer-care" className="text-sm underline">
        Back to inbox
      </Link>
      <h1 className="my-5 text-4xl font-medium">Approved knowledge.</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Review, approve and publish answers in{" "}
        <Link href="/studio" className="underline">
          Sanity Studio
        </Link>
        . Drafts and inactive entries never reach customers. Verify contacts and
        hours before approving the company profile.
      </p>
      <section className="mb-6 rounded-xl border p-5">
        <h2 className="mb-3 font-medium">Company profile</h2>
        <form action={prepareCompanyProfile}>
          <Button type="submit" variant="outline">
            Prepare draft from repository facts
          </Button>
        </form>
        <p className="mt-3 text-sm text-muted-foreground">
          Adds a draft if none exists. A reviewer must fill in verified contacts
          and approve it in Studio.
        </p>
      </section>
      <section className="rounded-xl border p-5">
        <h2 className="mb-4 font-medium">
          Prepare knowledge from published CMS content
        </h2>
        <form action={prepareKnowledgeDraft} className="space-y-4">
          <label className="block text-sm">
            Source document ID
            <Input
              name="sourceId"
              required
              placeholder="Published design, property or designPackage ID"
              className="mt-2"
            />
          </label>
          <label className="block text-sm">
            Business unit
            <select
              name="businessUnit"
              className="mt-2 block w-full rounded-lg border bg-background p-3"
            >
              {businessUnits.map((u) => (
                <option key={u} value={u}>
                  {u.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Topic
            <select
              name="topic"
              className="mt-2 block w-full rounded-lg border bg-background p-3"
            >
              {intents.map((i) => (
                <option key={i} value={i}>
                  {i.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Proposed revision of (optional approved knowledge ID)
            <Input name="revisionOf" className="mt-2" />
          </label>
          <Button type="submit">Create review draft</Button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          Imports descriptions and inclusions only. Prices and availability use
          live data. Each import creates a separate draft; existing approved
          answers remain intact.
        </p>
      </section>
      <section className="mt-6 space-y-3">
        <h2 className="font-medium">Published entries</h2>
        {entries.map((e) => (
          <article key={e._id} className="rounded-lg border p-4">
            <p className="font-medium">{e.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {e.businessUnit} · {e.approvalStatus} ·{" "}
              {e.active ? "Active" : "Inactive"} · Version {e.version}
            </p>
            <p className="mt-2 break-all font-mono text-xs">{e._id}</p>
          </article>
        ))}
        {!entries.length && (
          <p className="text-sm text-muted-foreground">
            No published knowledge yet. Open Studio to review prepared drafts.
          </p>
        )}
      </section>
    </main>
  );
}
