import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Derive the CSP img-src origin for the configured map tile server. */
function tileOrigin(): string {
  const template = process.env.NEXT_PUBLIC_MAP_TILE_URL || DEFAULT_TILE_URL;
  try {
    const host = new URL(template.replace("{s}.", "a.").replace(/\{[^}]+\}/g, "0")).host;
    // Tile servers commonly shard across subdomains (a/b/c), so allow the parent domain.
    const parent = host.split(".").slice(1).join(".");
    return template.includes("{s}") ? `https://*.${parent}` : `https://${host}`;
  } catch {
    return "https:";
  }
}

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${tileOrigin()}`,
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["sharp", "@prisma/client"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Camera/microphone/geolocation are needed by the reporting wizard on our own origin only.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
          ...(isDev
            ? []
            : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
