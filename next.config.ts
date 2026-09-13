import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
