"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["", "Overview"],
  ["earnings", "Earnings"],
  ["fund", "Fund"],
  ["profit", "Profit (live)"],
  ["economics", "Economics"],
  ["orchestration", "Orchestration"],
  ["memory", "Memory"],
  ["telemetry", "Telemetry"],
  ["soul", "Soul"],
  ["treasury", "Treasury"],
] as const;

export function Tabs({ address }: { address: string }) {
  const path = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4">
      {TABS.map(([seg, label]) => {
        const href = `/agents/${address}${seg ? `/${seg}` : ""}`;
        const active = path === href;
        return (
          <Link key={seg} href={href} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active ? "border-accent text-fg" : "border-transparent text-dim hover:text-fg"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
