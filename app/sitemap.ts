import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = "https://www.zignalconnect.com";
  return [
    { url: `${site}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${site}/signup`, changeFrequency: "weekly", priority: 0.9 },
  ];
}
