import type { NextConfig } from "next";

const publicAppVersion = process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "1.0.0";
const publicAppBuild =
  process.env.NEXT_PUBLIC_APP_BUILD?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA?.trim().slice(0, 7) ||
  "";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: publicAppVersion,
    NEXT_PUBLIC_APP_BUILD: publicAppBuild,
  },
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
