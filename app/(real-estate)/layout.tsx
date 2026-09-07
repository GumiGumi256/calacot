import Navbar from "@/components/navbar";
import { TechNavbar } from "@/components/tech/tech-navbar";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "Calacot Estates",
    template: "%s | Calacot Estates",
  },
  description:
    "Calacot Estates is your gateway to finding the perfect home in Uganda, dedicated to making your real estate journey seamless and enjoyable.",
};

type RealEstateLayoutProps = {
  children: ReactNode;
};

export default function RealEstateLayout({ children }: RealEstateLayoutProps) {
  return (
    <div className="min-h-svh dark:bg-brand-black bg-brand-white">
     

      <main id="tech-content">
       <Navbar />
        {children}
        </main>
    </div>
  );
}