import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  transpilePackages: ["@knowledge-hub/shared-types"],
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@knowledge-hub/shared-types": require.resolve(
        "@knowledge-hub/shared-types"
      ),
    };
    return config;
  },
};

export default nextConfig;
