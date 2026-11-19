import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // The service worker only exists in production builds; dev stays cache-free.
  disable: process.env.NODE_ENV === "development",
  cacheOnNavigation: true,
  reloadOnOnline: false,
  additionalPrecacheEntries: [{ url: "/offline", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" }],
});

const isDev = process.env.NODE_ENV === "development";

/** Origin of NEXT_PUBLIC_SUPABASE_URL when it is not already covered by *.supabase.co (e.g. a local `supabase start`). */
function extraSupabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith(".supabase.co")) return [];
    const ws = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, `${ws}//${url.host}`];
  } catch {
    return [];
  }
}

/**
 * Content-Security-Policy, sent as a static header on every response.
 * script-src keeps 'unsafe-inline' because the App Router streams its RSC payload in inline
 * <script> tags. The alternative, a per-request nonce, would force every route to render
 * dynamically (no prerendered HTML, no CDN cache for the app shell) and give the SW-precached
 * /offline page a stale nonce. No 'unsafe-eval' outside `next dev`. Styles need 'unsafe-inline'
 * for React style attributes (framer-motion, ring progress). next/font self-hosts the Google
 * fonts at build time, so no Google origin is allowed at runtime.
 */
const supabase = ["https://*.supabase.co", "wss://*.supabase.co", ...extraSupabaseOrigins()];
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Camera snapshots and downscaled uploads are blob: URLs; scans may be shown from Supabase Storage.
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self'",
  `connect-src 'self' ${supabase.join(" ")}`,
  // The live camera uses video.srcObject (not governed by CSP); recorded clips play from blob:.
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(process.env.VERCEL ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Legacy twin of frame-ancestors 'none' for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Camera for photo and barcode, microphone for voice notes. Nothing else.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default withSerwist(nextConfig);
