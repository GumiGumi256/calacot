import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { PublicIntro } from "@/components/layout/public-intro";

/**
 * Brand frame around Clerk's sign-in and sign-up forms: the public eyebrow, heading and copy on
 * one side, the form on the other (stacked on phones), with a way back to the site.
 */
export function AuthShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <main aria-labelledby="auth-title" className="site-container flex min-h-svh flex-col py-10 md:py-14">
      <Link
        href="/"
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-brand-black-600 hover:text-brand-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary dark:text-brand-black-200 dark:hover:text-brand-white"
      >
        <ArrowLeftIcon aria-hidden className="size-4" /> Back to Calacot
      </Link>
      <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-20">
        <PublicIntro id="auth-title" eyebrow={eyebrow} title={title} description={description} />
        <div className="flex justify-center lg:justify-end">{children}</div>
      </div>
    </main>
  );
}
