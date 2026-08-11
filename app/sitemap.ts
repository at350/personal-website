import type { MetadataRoute } from "next";
import { dispatches } from "@/lib/content";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.SITE_URL ?? "http://localhost:3000";
  const paths = ["", "/about", "/projects", "/resume", "/library", "/writing", "/contact"];
  return [
    ...paths.map((path) => ({ url: `${baseUrl}${path}`, lastModified: new Date("2026-08-11") })),
    ...dispatches.map((dispatch) => ({
      url: `${baseUrl}/writing/${dispatch.id}`,
      lastModified: new Date("2026-08-11"),
    })),
  ];
}
