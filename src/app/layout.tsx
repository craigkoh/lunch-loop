import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AuthHashReturn } from "@/components/auth-hash-return";
import { ThemeInitializer } from "@/components/theme-initializer";
import { appInfo } from "@/lib/app-info";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lunch Loop | The fun lunch loop for friends",
  applicationName: "Lunch Loop",
  description:
    "The fun, data-driven lunch club for 2–6 friends: turns, vetoes, and a shared restaurant list.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Lunch Loop",
  },
  icons: {
    // Serve a conventional /favicon.ico as well as the PNG app icon. Safari and
    // Chromium otherwise can retain a host-provided fallback favicon indefinitely.
    icon: [
      {
        url: `/favicon.svg?v=${appInfo.build}`,
        type: "image/svg+xml",
        sizes: "any",
      },
      {
        url: `/favicon.ico?v=${appInfo.build}`,
        type: "image/x-icon",
        sizes: "256x256",
      },
      {
        url: `/icon?v=${appInfo.build}`,
        type: "image/png",
        sizes: "512x512",
      },
    ],
    shortcut: `/favicon.ico?v=${appInfo.build}`,
    apple: [{ url: `/apple-icon?v=${appInfo.build}`, type: "image/png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#f97316" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col"><ThemeInitializer /><AuthHashReturn />{children}</body>
    </html>
  );
}
