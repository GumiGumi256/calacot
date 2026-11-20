import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/layout/auth-shell";
import { clerkFormAppearance } from "@/lib/ui/clerk-appearance";

export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="Calacot account"
      title="Welcome back."
      description="Sign in to follow your design purchases, or to reach the Calacot admin if you work with us."
    >
      <SignIn fallbackRedirectUrl="/auth/redirect" appearance={clerkFormAppearance} />
    </AuthShell>
  );
}
