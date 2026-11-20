import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { staffAccessStatus } from "@/lib/sales/permissions";
import { AccessPendingActions } from "@/components/admin/access-pending-actions";
import { ArrowLeftIcon } from "lucide-react";
import { PublicIntro } from "@/components/layout/public-intro";

export const metadata: Metadata = { title: "Access pending", robots: { index: false, follow: false } };

/**
 * Holding page for confirmed members of the Calacot organization who cannot use the admin
 * system yet (awaiting employee approval or role assignment) or whose access is paused.
 * It shows only the visitor's own status; it never renders admin data or navigation.
 */
export default async function AccessPendingPage() {
  const status = await staffAccessStatus();
  if (status.kind === "signed_out") {
    const session = await auth();
    return session.redirectToSignIn({ returnBackUrl: "/access-pending" });
  }
  if (status.kind === "granted") redirect("/auth/redirect");
  if (status.kind === "not_member") redirect("/");
  const user = await currentUser();
  const name = user?.firstName || user?.fullName || "there";
  const email = user?.primaryEmailAddress?.emailAddress;
  const paused = status.kind === "paused";
  const awaitingEmployeeApproval = status.kind === "awaiting_assignment" && status.role === "org:member";
  const title = paused ? "Your access is paused" : awaitingEmployeeApproval ? "Your account is awaiting approval" : "Your account is awaiting a role";
  const description = paused
    ? "An administrator has paused your access to the Calacot admin system. Your account and your earlier work are kept."
    : awaitingEmployeeApproval
      ? "Your invitation has been accepted. An administrator needs to confirm your employment before you can use the Calacot admin system."
      : "You are a member of the Calacot organization, but your role does not include access to the admin system yet. An administrator needs to assign one.";
  const steps = paused
    ? ["Contact a Calacot administrator if you think this is a mistake.", "When access is restored, use “Check again” below. You do not need a new invitation."]
    : ["No action is needed from you. Administrators can see that you are waiting.", "Once access is granted, use “Check again” below, or sign in again later.", "If you were expecting access already, contact the person who invited you."];
  return (
    <main className="site-container flex min-h-svh flex-col justify-center py-(--section-space)" aria-labelledby="access-pending-title">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/" className="mb-10 inline-flex min-h-11 items-center gap-2 text-sm text-brand-black-600 hover:text-brand-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary dark:text-brand-black-200 dark:hover:text-brand-white">
          <ArrowLeftIcon aria-hidden className="size-4" /> Back to Calacot
        </Link>
        <PublicIntro
          id="access-pending-title"
          eyebrow={<>Hello {name}{email ? ` · ${email}` : ""}</>}
          title={title}
          description={description}
        />
        <section aria-labelledby="access-pending-next" className="mt-10 rounded-3xl border border-brand-black-100 bg-brand-white p-6 sm:p-8 dark:border-brand-black-800 dark:bg-brand-black-900">
          <h2 id="access-pending-next" className="text-base font-medium text-brand-black dark:text-brand-white">What happens next</h2>
          <ol className="mt-5 flex flex-col gap-4">
            {steps.map((s, i) => (
              <li key={s} className="flex gap-4 text-base leading-7 text-brand-black-700 dark:text-brand-black-200">
                <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-primary-100 text-xs font-semibold text-brand-black dark:bg-brand-primary-900 dark:text-brand-primary">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <div className="mt-8"><AccessPendingActions /></div>
        </section>
        <p className="mt-6 text-sm text-brand-black-600 dark:text-brand-black-300">
          Looking for your design purchases instead? <Link className="font-medium text-brand-black underline underline-offset-4 dark:text-brand-white" href="/account/designs">Go to your account</Link>.
        </p>
      </div>
    </main>
  );
}
