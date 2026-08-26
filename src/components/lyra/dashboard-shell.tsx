"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Studio" },
  { href: "/tracker/", label: "Tracker" },
  { href: "/corporate/", label: "Corporate" },
  { href: "/inventory/", label: "Inventory" },
  { href: "/aip/", label: "AIP-Σ0" },
] as const;

function normalizePath(path: string) {
  if (!path || path === "/") return "/";
  return path.endsWith("/") ? path : `${path}/`;
}

export function DashboardShell({
  children,
  brand = "Lyra",
  eyebrow = "Orbital glass console",
}: {
  children: ReactNode;
  brand?: string;
  eyebrow?: string;
}) {
  const pathname = usePathname() ?? "/";
  const current = normalizePath(pathname.replace(/^\/anomaly-tracker/, "") || "/");

  return (
    <div className="lyra-shell relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div aria-hidden className="lyra-orbit" />
      <div aria-hidden className="lyra-orbit lyra-orbit--slow" />
      <div aria-hidden className="lyra-grid-floor" />
      <div aria-hidden className="lyra-haze" />

      <header className="glass-nav sticky top-0 z-40 animate-rise">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="group flex items-center gap-3">
            <span className="glass-mark grid size-10 place-items-center font-display text-lg tracking-tight text-primary">
              Λ
            </span>
            <span>
              <span className="block font-display text-xl leading-none tracking-tight text-foreground transition group-hover:text-primary">
                {brand}
              </span>
              <span className="mt-1 block text-[10px] tracking-[0.22em] text-muted-foreground uppercase">
                {eyebrow}
              </span>
            </span>
          </Link>

          <nav className="glass-rail flex flex-wrap items-center gap-1 p-1">
            {NAV.map((item) => {
              const href = item.href;
              const active =
                href === "/"
                  ? current === "/"
                  : current === href || current.startsWith(href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs tracking-[0.08em] uppercase transition",
                    active
                      ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_oklch(0.84_0.12_88/35%)]"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="relative z-10 flex flex-1 flex-col animate-rise-delayed">{children}</div>
    </div>
  );
}
