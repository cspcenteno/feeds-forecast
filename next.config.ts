import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/forecast-input', destination: '/forecasts', permanent: true },
      { source: '/budget', destination: '/budgets', permanent: true },
      { source: '/actual', destination: '/actuals', permanent: true },
    ];
  },
};

export default nextConfig;
