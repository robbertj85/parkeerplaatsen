import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Enable gzip compression
  compress: true,

  // Optimize static file serving
  experimental: {
    optimizePackageImports: ['@turf/area', 'leaflet'],
  },

  // Configure headers for better caching
  async headers() {
    return [
      {
        source: '/truck_parking_enriched.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/:all*(geojson)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
