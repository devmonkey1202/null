import type { NextConfig } from "next";

const enableStandaloneOutput = process.env.NULL_ENABLE_STANDALONE === "1";
const customDistDir = process.env.NULL_NEXT_DIST_DIR?.trim();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  ...(customDistDir ? { distDir: customDistDir } : {}),
  experimental: {
    // .next 캐시 접근 거부(액세스 거부) 시 Turbopack persistence 비활성화
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

if (enableStandaloneOutput) {
  nextConfig.output = "standalone";
}

export default nextConfig;
