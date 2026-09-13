import Navbar from "@/components/navbar";
import { TechNavbar } from "@/components/tech/tech-navbar";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "Calacot Tech",
    template: "%s | Calacot Tech",
  },
  description: "Calacot Tech helps businesses turn ideas into useful digital products and improve everyday work with custom software.",
};

type TechLayoutProps = {
  children: ReactNode;
};

export default function TechLayout({ children }: TechLayoutProps) {
  return (
    <div className="min-h-svh bg-brand-black text-brand-white">
     

      <main id="tech-content">
       <Navbar />
        {children}
        </main>
    </div>
  );
}