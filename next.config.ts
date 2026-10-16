import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server be opened from other devices on the LAN, not just localhost.
  allowedDevOrigins: ["192.168.0.11"],
};

export default nextConfig;
