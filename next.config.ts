import type { NextConfig } from "next";

const localSupabaseConnect = process.env.NODE_ENV === "development"
  ? " http://127.0.0.1:54321 http://localhost:54321 ws://127.0.0.1:54321 ws://localhost:54321"
  : "";

const nextConfig: NextConfig = {
  env: {
    // Vercel sets VERCEL_ENV for the build. The sign-in page reads the public
    // copy so a preview host is not rewritten to lunchloop.app in the browser.
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "",
  },
  experimental: {
    useWasmBinary: true,
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.google.com https://*.gstatic.com; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co${localSupabaseConnect}; frame-src https://www.google.com` },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      ],
    }];
  },
};

export default nextConfig;
