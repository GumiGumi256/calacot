import type { Metadata } from "next";
import Navbar from "@/components/navbar";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
