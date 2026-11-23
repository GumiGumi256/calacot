import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { sharedDocument } from "@/lib/sales/shared-documents";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Shared document", robots: { index: false, follow: false }, referrer: "no-referrer" };

// The token lookup is request-time data, so it renders inside a Suspense boundary (cacheComponents).
async function SharedContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await sharedDocument(token);
  if (!doc) notFound();
  const pdf = `/api/sales/shared/${token}/pdf`;
  return <main className="mx-auto w-full max-w-4xl space-y-6 px-5 py-12"><div><p className="text-sm font-semibold uppercase tracking-wide">Calacot</p><h1 className="mt-3 text-3xl font-semibold">{doc.kind === "invoice" ? "Invoice" : "Payment receipt"} {doc.number}</h1><p className="mt-2">Prepared for {doc.client}</p><p className="mt-1 text-xl font-medium">{formatMoney(doc.currency, doc.amount)}</p><p className="mt-3 text-sm text-muted-foreground">This private link expires on {formatDate(doc.expires_at)}. Anyone with the link can view this document.</p>{doc.kind === "receipt" && <p className="mt-2 text-sm text-muted-foreground">The receipt reflects payment and refund records when the link was created.</p>}</div><a className="inline-block rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground" href={`${pdf}?download=1`}>Download {doc.kind === "invoice" ? "invoice" : "receipt"} PDF</a><iframe title="Document preview" src={pdf} className="h-[75vh] w-full rounded-lg border bg-white" /><p className="text-sm text-muted-foreground">If the preview does not appear, download the PDF above.</p></main>;
}

export default function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  return <Suspense fallback={<main className="mx-auto w-full max-w-4xl px-5 py-12">Loading document…</main>}><SharedContent params={params} /></Suspense>;
}
