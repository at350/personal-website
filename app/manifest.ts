import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alan Tai | Field Notes",
    short_name: "Alan Tai",
    description: "Projects, dispatches, marginalia, and field notes from Alan Tai.",
    start_url: "/",
    display: "standalone",
    background_color: "#171714",
    theme_color: "#e4472f",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
