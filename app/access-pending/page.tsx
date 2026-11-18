import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { staffAccessStatus } from "@/lib/sales/permissions";
import { AccessPendingActions } from "@/components/admin/access-pending-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Access pending", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

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
    <main className="flex min-h-svh items-center justify-center p-4 md:p-6" aria-labelledby="access-pending-title">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <p className="text-sm text-muted-foreground">Hello {name}{email ? ` (${email})` : ""}</p>
          <CardTitle id="access-pending-title" className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <section aria-labelledby="access-pending-next">
            <h2 id="access-pending-next" className="text-sm font-medium">What happens next</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
          </section>
          <AccessPendingActions />
          <p className="text-xs text-muted-foreground">
            Looking for your design purchases instead? <Link className="underline underline-offset-4" href="/account/designs">Go to your account</Link>.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
