import Navbar from "@/components/navbar";
import { TechNavbar } from "@/components/tech/tech-navbar";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "Calacot Estates",
    template: "%s | Calacot Estates",
  },
  description: "Find a home or land that fits your plans. Calacot Estates supports property discovery, marketing and advisory in Uganda.",
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