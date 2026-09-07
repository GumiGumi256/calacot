import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";

import { PropertyLeadForm } from "@/components/real-estate/property-lead-form";


type PageProps = {
  searchParams: Promise<{
    type?: string | string[];
  }>;
};

async function PropertyForm({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <PropertyLeadForm
      initialType={
        params.type === "development" ? "development" : "individual"
      }
    />
  );
}

export const metadata = pageMetadata("/list-property");

export default function ListPropertyPage(props: PageProps) {
  return (
    <main className="min-h-svh bg-brand-white text-brand-black dark:bg-brand-black dark:text-brand-white">
      <div className="mx-auto max-w-3xl px-6 pb-16 pt-28 md:px-10 md:pb-20 md:pt-32">
        <header className="mb-9">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-black/60 dark:text-brand-white/60">
            For owners and developers
          </p>

          <h1 className="mt-4 font-serif text-4xl leading-[1.08] tracking-[-0.035em] md:text-5xl">
            Introduce your property.
          </h1>

          <p className="mt-4 max-w-xl text-base leading-7 text-brand-black/65 dark:text-brand-white/65">
            Share a few details and our team will contact you to discuss
            listing and selling with Calacot Estates.
          </p>
        </header>

        <Suspense
          fallback={
            <p role="status" className="py-8 text-sm">
              Preparing your form…
            </p>
          }
        >
          <PropertyForm {...props} />
        </Suspense>
      </div>
    </main>
  );
}