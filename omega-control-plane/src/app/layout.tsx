import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { AuthBar } from "@/components/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Omega Control Plane — Conway Automaton",
  description: "Fleet, economics, orchestration and audit for Conway Automaton agents, from agent-signed state.db snapshots and live Base reads.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#05070b" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <Link href="/" className="font-mono text-sm font-bold tracking-widest text-accent">
              Ω OMEGA
            </Link>
            <nav className="flex gap-3 text-sm text-dim">
              <Link href="/" className="hover:text-fg">Fleet</Link>
              <Link href="/audit" className="hover:text-fg">Audit</Link>
              <Link href="/docs" className="hover:text-fg">Connect</Link>
            </nav>
            <div className="ml-auto">
              <AuthBar />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-line px-4 py-4 text-center text-xs text-dim">
          Data: agent-signed snapshots of ~/.automaton/state.db · Base mainnet RPC · api.conway.tech. No projections, no synthetic data.
        </footer>
      </body>
    </html>
  );
}
