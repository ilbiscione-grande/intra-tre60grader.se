/** @type {import('next').NextConfig} */
const PWA_CACHE_VERSION = '2026-04-02-mobile-refresh-1';

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: `html-cache-${PWA_CACHE_VERSION}`,
        networkTimeoutSeconds: 5
      }
    },
    {
      urlPattern: ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: `asset-cache-${PWA_CACHE_VERSION}`
      }
    },
    {
      urlPattern: ({ request }) => request.method === 'GET',
      handler: 'NetworkFirst',
      options: {
        cacheName: `get-runtime-cache-${PWA_CACHE_VERSION}`,
        networkTimeoutSeconds: 5
      }
    }
  ]
});

module.exports = withPWA({
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  }
});
