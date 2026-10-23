import type { MetadataRoute } from "next";
import { appInfo } from "@/lib/app-info";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lunch Loop",
    short_name: "Lunch Loop",
    description: "Your crew’s shared lunch database and decision loop.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffaf3",
    theme_color: "#f97316",
    icons: [
      { src: `/icon.png?v=${appInfo.build}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/apple-icon.png?v=${appInfo.build}`, sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
