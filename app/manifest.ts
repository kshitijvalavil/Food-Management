import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ShelfLife",
    short_name: "ShelfLife",
    description: "Know what's in your fridge, freezer and pantry, and hear about it a day before it turns.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#2e31a0",
    background_color: "#eeefea",
    categories: ["food", "lifestyle", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add food", url: "/capture/camera?mode=photo", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Kitchen", url: "/kitchen", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
