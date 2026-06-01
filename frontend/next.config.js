/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pass the backend API URL to the client
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  },
  // Disable image optimization for uploaded PDFs served from backend
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
