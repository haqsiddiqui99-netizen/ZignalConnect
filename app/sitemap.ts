import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = "https://www.zignalconnect.com";
  return [
    { url: `${site}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${site}/features`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${site}/pricing`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${site}/for-subscribers`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${site}/instant-support`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${site}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${site}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}/refund`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}/signup`, changeFrequency: "weekly", priority: 0.9 },
  ];
}
