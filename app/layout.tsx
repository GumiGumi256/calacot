import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Outfit, Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navbar";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import Footer from "@/components/footer";
import { Toaster } from "@/components/ui/toast"

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const outfitHeading = Outfit({
  subsets: ["latin"],
  variable: "--font-heading",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Calacot",
  description:
    "Get way to modern construction, design and architecture, painting, interior design, and more.",
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
            "font-sans", geist.variable)}
    >
      <body className="min-h-full flex flex-col bg-brand-white dark:bg-brand-black">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <Navbar />
          {children}
          <Footer />
        <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
