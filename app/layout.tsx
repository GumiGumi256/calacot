import { Suspense } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { siteUrl, seoPages } from "@/lib/seo";
import { SiteStructuredData } from "@/components/seo/structured-data";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Outfit, Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navbar";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import Footer from "@/components/footer";
import { CopyrightYear } from "@/components/layout/copyright-year";
import { business } from "@/lib/business";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

// const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const outfitHeading = Outfit({
  subsets: ["latin"],
  variable: "--font-heading",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Calacot | Architects, Interiors, Painting & Property in Uganda",
    template: "%s | Calacot",
  },
  description: seoPages["/"].description,
  // Search Console / Bing Webmaster ownership checks, set in deployment settings (no code change).
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION?.trim() ? { google: process.env.GOOGLE_SITE_VERIFICATION.trim() } : {}),
    ...(process.env.BING_SITE_VERIFICATION?.trim() ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION.trim() } } : {}),
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        "",
        plusJakartaSans.variable,
        outfitHeading.variable,
        "font-sans",
       
      )}
    >
      <body className="min-h-full flex flex-col bg-brand-white dark:bg-brand-black">
        <ClerkProvider
        appearance={
          {
            variables: {
              colorPrimary: 'var(--color-brand-primary)'
            }
          }
        }
        >
          <SiteStructuredData />
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider>
              {/* <Navbar /> */}
              {children}
            </TooltipProvider>
            {/* usePathname() inside is request-time on dynamic routes: give it its own boundary. */}
            <Suspense fallback={null}>
              <Footer year={<CopyrightYear />} contact={{ place: [business.street, business.area, `${business.city}, ${business.countryName}`].filter(Boolean).join(", "), phone: business.phone, email: business.email }} />
            </Suspense>
            <Toaster />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
