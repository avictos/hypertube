import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",
    allowedDevOrigins: ["ec2-51-48-60-245.eu-south-2.compute.amazonaws.com"],
};

export default nextConfig;
