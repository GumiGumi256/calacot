import { TechNavbar } from "@/components/tech/tech-navbar";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "Calacot Tech",
    template: "%s | Calacot Tech",
  },
  description:
    "Calacot Tech designs intelligent digital systems that help African businesses operate efficiently and scale with greater control.",
};

type TechLayoutProps = {
  children: ReactNode;
};

export default function TechLayout({ children }: TechLayoutProps) {
  return (
    <div className="min-h-svh bg-brand-black text-brand-white">
     

      <main id="tech-content">
        <TechNavbar />
        {children}
        </main>
    </div>
  );
}