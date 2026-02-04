"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: "~" },
  { href: "/sessions", label: "Sessions", icon: ">" },
  { href: "/leaderboard", label: "Leaderboard", icon: "#" },
  { href: "/searches", label: "Searches", icon: "?" },
  { href: "/personas", label: "Personas", icon: "@" },
  { href: "/settings", label: "Settings", icon: "*" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col">
      <div className="p-4 border-b border-zinc-800">
        <h1 className="text-lg font-bold text-white">Tweet Pipeline</h1>
        <p className="text-xs text-zinc-500 mt-0.5">scrape &rarr; rewrite &rarr; post</p>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              )}
            >
              <span className="font-mono text-xs w-4 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
