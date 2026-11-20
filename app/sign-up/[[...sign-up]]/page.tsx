import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/layout/auth-shell";
import { clerkFormAppearance } from "@/lib/ui/clerk-appearance";

export const metadata = { title: "Create an account", robots: { index: false, follow: false } };

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Calacot account"
      title="Create your account."
      description="One account for your architectural design purchases, downloads and conversations with our team."
    >
      <SignUp fallbackRedirectUrl="/auth/redirect" appearance={clerkFormAppearance} />
    </AuthShell>
  );
}
