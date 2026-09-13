import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { EstateEnquiryForm } from "@/components/real-estate/enquiry-form";
import { parseIntent } from "@/lib/enquiry-schema";


type ContactPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function EnquiryContent({ searchParams }: ContactPageProps) {
  const params = await searchParams;
  const intent = parseIntent(params.intent);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16 xl:gap-20">
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-black/60 dark:text-brand-white/60">Calacot Estates</p>
        <h1 className="mt-5 max-w-[13ch] font-serif text-4xl leading-[1.06] tracking-[-0.04em] md:text-5xl lg:text-6xl">Let’s talk about your next chapter.</h1>
        <p className="mt-5 max-w-sm text-base leading-7 text-brand-black/65 dark:text-brand-white/65">A home to find, land to build on or a property to sell. Tell us what you have in mind.</p>
        <div className="mt-8 hidden max-w-sm lg:block">
          <h2 className="text-sm font-semibold">A conversation, shaped around you.</h2>
          <p className="mt-2 text-sm leading-7 text-brand-black/60 dark:text-brand-white/60">Share the essentials. Our team will review your enquiry and get in touch using your preferred contact method.</p>
        </div>
      </aside>
      <div className="min-w-0">
        <EstateEnquiryForm key={intent} initialIntent={intent} />
      </div>
    </div>
  );
}

function FormFallback() {
  return <div role="status" className="py-12 text-sm text-brand-black/65 dark:text-brand-white/65">Preparing your enquiry form…</div>;
}

export const metadata = pageMetadata("/contact");

export default function ContactPage(props: ContactPageProps) {
  return (
    <main className="min-h-svh bg-brand-white text-brand-black dark:bg-brand-black dark:text-brand-white">
      <div className="pb-16 pt-28 md:pb-20 md:pt-32 site-container">
        <Link href="/" className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-brand-black/65 hover:text-brand-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary dark:text-brand-white/65 dark:hover:text-brand-white">
          <ArrowLeft aria-hidden="true" className="size-4" /> Back to Calacot
        </Link>
        <Suspense fallback={<FormFallback />}><EnquiryContent {...props} /></Suspense>
      </div>
    </main>
  );
}
