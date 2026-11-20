import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { ArrowRightIcon, BriefcaseIcon, CalendarIcon, CheckIcon, HomeIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PublicIntro } from "@/components/layout/public-intro";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{ type?: string; service?: string }>;
};

export const metadata = pageMetadata("/thank-you");

export default async function ThankYouPage({ searchParams }: PageProps) {
  const { type, service } = await searchParams;
  const isScheduledCall = type === "scheduled_call" || type === "call";

  const content = isScheduledCall
    ? {
        eyebrow: "Consultation requested",
        title: "Your call request is in.",
        subtitle: "We've received your preferred time and contact details.",
        Icon: CalendarIcon,
        nextSteps: [
          "Our team reviews your preferred date and time.",
          "We contact you to confirm availability before the call.",
          "Have any questions or reference material ready for the conversation.",
        ],
      }
    : {
        eyebrow: "Request submitted",
        title: "Your project request is in.",
        subtitle: "Thank you for sharing your project details with our team.",
        Icon: BriefcaseIcon,
        nextSteps: [
          "A project lead reviews your scope, budget and timeline.",
          "We reach out by email or phone to confirm details and next steps.",
          "If it's urgent, schedule a call with our team straight away.",
        ],
      };

  return (
    <main aria-labelledby="thank-you-title" className="site-container flex min-h-[80svh] flex-col justify-center pt-28 pb-(--section-space) md:pt-32">
      <div className="mx-auto w-full max-w-2xl">
        <span aria-hidden className="mb-8 flex size-14 items-center justify-center rounded-full bg-brand-primary text-brand-black">
          <CheckIcon className="size-7" strokeWidth={2.5} />
        </span>
        <PublicIntro id="thank-you-title" eyebrow={content.eyebrow} title={content.title} description={content.subtitle} />

        <section aria-labelledby="next-steps" className="mt-10 rounded-3xl border border-brand-black-100 bg-brand-white p-6 sm:p-8 dark:border-brand-black-800 dark:bg-brand-black-900">
          <h2 id="next-steps" className="flex items-center gap-2 text-base font-medium text-brand-black dark:text-brand-white">
            <content.Icon aria-hidden className="size-4 text-brand-primary-700 dark:text-brand-primary" />
            What happens next
          </h2>
          <ol className="mt-5 flex flex-col gap-4">
            {content.nextSteps.map((step, index) => (
              <li key={step} className="flex gap-4 text-base leading-7 text-brand-black-700 dark:text-brand-black-200">
                <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-primary-100 text-xs font-semibold text-brand-black dark:bg-brand-primary-900 dark:text-brand-primary">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/" className={cn(buttonVariants({ size: "lg" }), "rounded-full")}>
            <HomeIcon aria-hidden /> Back to home
          </Link>
          {!isScheduledCall && (
            <Link href={`/schedule-call${service ? `?service=${encodeURIComponent(service)}` : ""}`} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-full")}>
              Schedule a call now <ArrowRightIcon aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
