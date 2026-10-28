import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { AuthBar } from "@/components/auth";
import { DESKTOP_WIDTH, VIEW_COOKIE, ViewToggle } from "@/components/view-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "OMEGA Protocol — Operations",
  description: "Continuous-batch exposure register, incident desk, orchestration graph, runtime telemetry and sealed audit trail.",
};

async function viewMode(): Promise<"mobile" | "desktop"> {
  return (await cookies()).get(VIEW_COOKIE)?.value === "desktop" ? "desktop" : "mobile";
}

export async function generateViewport(): Promise<Viewport> {
  return (await viewMode()) === "desktop"
    ? { width: String(DESKTOP_WIDTH), themeColor: "#0b0e14" }
    : { width: "device-width", initialScale: 1, themeColor: "#0b0e14" };
}

const NAV = [
  ["/", "Command"],
  ["/anomalies", "Register"],
  ["/batches", "Batches"],
  ["/incidents", "Incidents"],
  ["/pipeline", "Orchestration"],
  ["/telemetry", "Telemetry"],
  ["/treasury", "Treasury"],
  ["/assets", "Assets"],
  ["/audit", "Audit"],
  ["/docs", "API"],
] as const;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const view = await viewMode();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <Link href="/" className="font-mono text-sm font-bold tracking-widest text-accent">
              Ω OMEGA PROTOCOL
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <ViewToggle initial={view} />
              <AuthBar />
            </div>
            <nav className="-mx-4 flex w-full gap-3 overflow-x-auto px-4 text-sm text-dim md:mx-0 md:w-auto md:px-0">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="whitespace-nowrap hover:text-fg">
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-line px-4 py-4 text-center text-xs text-dim">
          Sources: exploited-vulnerability catalog (cisa.gov), CVE API 2.0 (nvd.nist.gov), EPSS (first.org), and this platform&apos;s own measured pipeline runtime. Treasury figures are simulated compute units.
        </footer>
      </body>
    </html>
  );
}
