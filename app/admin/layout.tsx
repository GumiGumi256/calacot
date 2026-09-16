import type { Metadata } from "next";
import { requireAdmin } from "@/lib/design-purchases/permissions";
import Navbar from "@/components/navbar";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
