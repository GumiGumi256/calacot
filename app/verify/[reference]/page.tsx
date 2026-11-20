import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicVerification } from "@/components/documents/public-verification";

export const metadata: Metadata = { title: "Verify a document", robots: { index: false, follow: false } };
async function ReferenceContent({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return <PublicVerification initialReference={reference.slice(0, 100)} />;
}
export default function VerifyReferencePage({ params }: { params: Promise<{ reference: string }> }) {
  return <Suspense fallback={<main className="site-container min-h-[80svh] pt-28 md:pt-32">Loading verification…</main>}><ReferenceContent params={params} /></Suspense>;
}
