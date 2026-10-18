import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data: blob: https://storage.googleapis.com https://firebasestorage.googleapis.com; media-src 'self' blob: https://storage.googleapis.com https://firebasestorage.googleapis.com; connect-src 'self' https://storage.googleapis.com https://firebasestorage.googleapis.com https://*.googleapis.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; upgrade-insecure-requests" },
      ],
    }];
  },
};

export default nextConfig;
