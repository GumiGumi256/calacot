import { currentUser } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { getPurchasableDesign } from "@/lib/queries/design";
import { requireUser } from "@/lib/design-purchases/permissions";
import DesignCheckout from "@/components/architecture/design-checkout";
import { createDesignPurchase } from "./actions";

export const metadata = {
  title: "Confirm your design request",
  robots: { index: false, follow: false },
};
export default async function DesignCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ package?: string }>;
}) {
  const { slug } = await params;
  const { package: packageId } = await searchParams;
  if (!packageId) notFound();
  await requireUser(
    `/architecture/designs/${encodeURIComponent(slug)}/checkout?package=${encodeURIComponent(packageId)}`,
  );
  const [user, design] = await Promise.all([
    currentUser(),
    getPurchasableDesign(slug),
  ]);
  if (!design || design.status !== "available") notFound();
  const selected = design.packages?.find(
    (item) => item.package?._id === packageId && item.package.isActive,
  );
  if (!selected || !Number.isFinite(selected.price) || selected.price <= 0)
    notFound();
  return (
    <DesignCheckout
      action={createDesignPurchase}
      design={{
        id: design._id,
        title: design.title,
        slug: design.slug,
        code: design.designCode,
      }}
      selectedPackage={{
        id: selected.package._id,
        name: selected.package.name,
        description: selected.package.description,
        includes: selected.package.includes ?? [],
        price: selected.price,
      }}
      customer={{
        fullName: [user?.firstName, user?.lastName].filter(Boolean).join(" "),
        email: user?.primaryEmailAddress?.emailAddress || "",
        phone: user?.primaryPhoneNumber?.phoneNumber || "",
      }}
    />
  );
}
