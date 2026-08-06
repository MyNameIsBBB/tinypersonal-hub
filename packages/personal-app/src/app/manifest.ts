import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TinyPersonal Hub",
    short_name: "TinyPersonal",
    description: "พื้นที่ส่วนตัวสำหรับ Schedule, Notes, Media, Vault และ Gemini AI",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fffdf9",
    theme_color: "#f7efe0",
    orientation: "any",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/tinypersonal-logo-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/tinypersonal-logo-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/tinypersonal-logo-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Schedule", short_name: "Schedule", url: "/", icons: [{ src: "/tinypersonal-logo-192.png", sizes: "192x192" }] },
      { name: "AI Assistant", short_name: "AI", url: "/ai", icons: [{ src: "/tinypersonal-logo-192.png", sizes: "192x192" }] },
      { name: "Notes", short_name: "Notes", url: "/notes", icons: [{ src: "/tinypersonal-logo-192.png", sizes: "192x192" }] },
    ],
  };
}
