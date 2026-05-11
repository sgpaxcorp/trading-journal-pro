import type { NextConfig } from "next";

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

const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  "blob:",
  "https://hcaptcha.com",
  "https://*.hcaptcha.com",
  "https://js.hcaptcha.com",
];

if (process.env.NODE_ENV !== "production") {
  scriptSrc.splice(2, 0, "'unsafe-eval'");
}

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: https: https://hcaptcha.com https://*.hcaptcha.com",
  "font-src 'self' data: https:",
  "manifest-src 'self'",
  "media-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com",
  `script-src ${scriptSrc.join(" ")}`,
  "worker-src 'self' blob:",
  "connect-src 'self' https: wss: https://hcaptcha.com https://*.hcaptcha.com",
  "frame-src https://hcaptcha.com https://*.hcaptcha.com",
].join("; ");

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
