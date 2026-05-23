import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VM Bettingbot 2026",
  description: "AI-drevet bettinganalyse — Eliteserien & VM 2026",
};

export const viewport: Viewport = {
  themeColor: "#0f1117",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
