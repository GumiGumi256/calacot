import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/sales/*": ["./public/calacot-logo.png", "./node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"],
  },
  async headers() {
    return [{ source: "/account/customer-care/:path*", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "private, no-store" },
    ] }];
  },
  async redirects() {
    return [
      {
        source: "/software-development",
        destination: "/calacot-tech",
        permanent: true,
      },
      // Preserve previously shared enquiry and booking links.
      ...["/start-project", "/schedule-call", "/thank-you"].map((source) => ({
        source,
        has: [{ type: "query" as const, key: "service", value: "software-development" }],
        destination: source + "?service=calacot-tech",
        permanent: true,
      })),
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
      },
    ],
  }

  
};

export default nextConfig;
