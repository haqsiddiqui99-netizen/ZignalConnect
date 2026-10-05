import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/signup"],
      disallow: ["/provider", "/subscriber", "/zignal", "/receipts"],
    },
    sitemap: "https://www.zignalconnect.com/sitemap.xml",
    host: "https://www.zignalconnect.com",
  };
}
