import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Montserrat, Outfit } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navbar";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import Footer from "@/components/footer";


const outfitHeading = Outfit({
  subsets: ["latin"],
  variable: "--font-heading",
});

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-sans" });

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
        "font-sans",
        montserrat.variable,
        outfitHeading.variable,
      )}
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
        </ThemeProvider>
      </body>
    </html>
  );
}
