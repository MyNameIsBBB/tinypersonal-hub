import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TinyPersonal Hub",
  description: "A modular personal assistant workspace",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
