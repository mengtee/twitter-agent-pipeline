import { resolve } from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias["@pipeline"] = resolve(__dirname, "../src");
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
  serverExternalPackages: ["dotenv"],
};

export default nextConfig;
