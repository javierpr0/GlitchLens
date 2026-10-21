import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only the Docker build needs it: the standalone server chdir()s into .next/standalone,
  // which would put the default ./data dir somewhere a rebuild wipes.
  output: process.env.GLITCHLENS_STANDALONE === "true" ? "standalone" : undefined,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
