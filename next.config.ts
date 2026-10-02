import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  async redirects() {
    return [
      { source: "/admin/customers/:path*", destination: "/provider/subscriber/:path*", permanent: false },
      { source: "/admin/customers", destination: "/provider/subscriber", permanent: false },
      { source: "/admin/payments/:path*", destination: "/provider/revenue/:path*", permanent: false },
      { source: "/admin/payments", destination: "/provider/revenue", permanent: false },
      { source: "/admin/billing", destination: "/provider/upgrade", permanent: false },
      { source: "/admin/:path*", destination: "/provider/:path*", permanent: false },
      { source: "/admin", destination: "/provider", permanent: false },
      { source: "/operator/:path*", destination: "/zignal/:path*", permanent: false },
      { source: "/operator", destination: "/zignal", permanent: false },
      { source: "/portal/provider/:path*", destination: "/provider/:path*", permanent: false },
      { source: "/portal/provider", destination: "/provider", permanent: false },
      { source: "/portal/subscriber/:path*", destination: "/subscriber/:path*", permanent: false },
      { source: "/portal/subscriber", destination: "/subscriber", permanent: false },
      { source: "/portal/zignal/:path*", destination: "/zignal/:path*", permanent: false },
      { source: "/portal/zignal", destination: "/zignal", permanent: false },
      { source: "/portal/history", destination: "/subscriber/receipts", permanent: false },
      { source: "/portal/pay", destination: "/subscriber/pay", permanent: false },
      { source: "/portal/complaints", destination: "/subscriber/complaints", permanent: false },
      { source: "/portal", destination: "/subscriber", permanent: false },
    ];
  },
};

export default nextConfig;
