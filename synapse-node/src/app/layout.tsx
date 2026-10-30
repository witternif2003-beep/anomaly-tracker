import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synapse-Node Dashboard",
  description: "Continuous DeepSeek master-prompt batch processing with live SSE output and measured telemetry.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#020617" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-mono antialiased">{children}</body>
    </html>
  );
}
