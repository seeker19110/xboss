/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pg", "better-sqlite3"],
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
