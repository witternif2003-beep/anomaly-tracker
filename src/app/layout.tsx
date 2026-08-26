import type { Metadata } from "next";
import { Geist, Geist_Mono, Syne } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardShell } from "@/components/lyra/dashboard-shell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Lyra — Futuristic glass command console",
  description:
    "Orbital ice HUD: glassmorphism dashboard, 3D globe, GHOST-HAND / Post-doc / anomaly tracker.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${syne.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <DashboardShell>{children}</DashboardShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
