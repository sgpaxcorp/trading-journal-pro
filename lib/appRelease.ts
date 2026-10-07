export const APP_RELEASE = {
  version: process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "1.0.0",
  build: process.env.NEXT_PUBLIC_APP_BUILD?.trim() || null,
} as const;
