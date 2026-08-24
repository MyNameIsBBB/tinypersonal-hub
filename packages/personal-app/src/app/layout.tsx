import type { Metadata } from "next";
import type { ReactNode } from "react";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "TinyPersonal Schedule",
  description: "ปฏิทิน งาน และกิจวัตรที่วางแผนร่วมกับ Gemini AI",
  icons: { icon: "/tinypersonal-logo-192.png", apple: "/tinypersonal-logo-192.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "TinyPersonal" },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
