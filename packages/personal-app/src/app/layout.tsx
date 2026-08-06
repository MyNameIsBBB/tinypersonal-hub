import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "TinyPersonal Schedule",
  description: "ปฏิทิน งาน และกิจวัตรที่วางแผนร่วมกับ Gemini AI",
  icons: { icon: "/tinypersonal-logo-192.png", apple: "/tinypersonal-logo-192.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "TinyPersonal" },
};

export const viewport: Viewport = { themeColor: "#f7efe0", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="th"><body>{children}<PwaRegister /></body></html>;
}
