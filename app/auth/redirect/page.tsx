import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/** Resolve membership even when a signed-in user has not selected an active organization. */
export default async function AuthRedirect({ searchParams }: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const session = await auth();
  if (!session.userId) return session.redirectToSignIn({ returnBackUrl: "/auth/redirect" });
  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({ userId: session.userId, limit: 100 });
  const configured = process.env.CALACOT_CLERK_ORG_ID?.trim();
  const selected = memberships.data.find(m => m.organization.id === configured)
    ?? memberships.data.find(m => m.organization.id === session.orgId)
    ?? memberships.data.find(m => Boolean(m.organization.slug));
  if (!selected?.organization.slug) redirect("/account/designs");
  const { returnTo } = await searchParams;
  const target = returnTo && /^\/admin(?:\/|\?|$)/.test(returnTo) ? returnTo : "/admin";
  redirect(`/${encodeURIComponent(selected.organization.slug)}${target}`);
}
