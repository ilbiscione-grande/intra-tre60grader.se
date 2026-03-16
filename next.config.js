/** @type {import('next').NextConfig} */
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
        cacheName: 'html-cache',
        networkTimeoutSeconds: 5
      }
    },
    {
      urlPattern: ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'asset-cache'
      }
    },
    {
      urlPattern: ({ request }) => request.method === 'GET',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'get-runtime-cache',
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