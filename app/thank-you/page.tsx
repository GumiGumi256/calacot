import Link from "next/link";
import { CheckCircle2Icon, CalendarIcon, BriefcaseIcon, ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";

type PageProps = {
  searchParams: Promise<{ type?: string; service?: string }>;
};

export default async function ThankYouPage({ searchParams }: PageProps) {
  const { type, service } = await searchParams;

  const isScheduledCall = type === "scheduled_call" || type === "call";

  const content = isScheduledCall
    ? {
        title: "Call Scheduled Successfully!",
        subtitle: "We've reserved your time block and logged your details.",
        badge: "Consultation Booked",
        Icon: CalendarIcon,
        nextSteps: [
          "Check your inbox for a confirmation email with calendar details.",
          "Prepare any specific questions or existing reference materials for our discussion.",
          "Our team will reach out at your chosen time.",
        ],
      }
    : {
        title: "Project Request Received!",
        subtitle: "Thank you for sharing your project details with our team.",
        badge: "Request Submitted",
        Icon: BriefcaseIcon,
        nextSteps: [
          "Our project lead will review your scope, budget, and timeline within 24 hours.",
          "We'll reach out via email or phone to confirm details and provide next steps.",
          "If urgent, feel free to schedule an immediate call with our team.",
        ],
      };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-xl w-full text-center space-y-8">
        {/* Success Icon */}
        <div className="relative inline-flex items-center justify-center">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2Icon className="h-10 w-10 text-primary" />
          </div>
        </div>

        {/* Header Text */}
        <div className="space-y-2">
          <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {content.badge}
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{content.title}</h1>
          <p className="text-muted-foreground text-lg">{content.subtitle}</p>
        </div>

        {/* Next Steps Box */}
        <div className="bg-muted/50 border rounded-xl p-6 text-left space-y-4">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <content.Icon className="h-4 w-4 text-primary" />
            <span>What happens next?</span>
          </div>
          <ul className="space-y-3 text-sm text-muted-foreground list-disc list-inside">
            {content.nextSteps.map((step, index) => (
              <li key={index} className="leading-relaxed">
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Button size="lg" >
            <Link href="/" className="flex items-center justify-center gap-2">
            Back to Home
            <Image 
            src='/icons/home.svg'
            alt="Chevron Right"
            width={16}
            height={16}
            
            />
            
            </Link>
          </Button>

          {!isScheduledCall && (
            <Button variant="outline" size="lg">
              <Link href={`/schedule-call${service ? `?service=${service}` : ""}`} className="flex items-center justify-center gap-2">
                Schedule a Call Now <Image 
                src='/icons/chevron-right.svg'
                alt="Chevron Right"
                width={16}
                height={16}
                className="invert"
                />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}