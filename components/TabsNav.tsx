"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { name: "Scenario Builder", href: "/" },
  { name: "Scenario Tracker", href: "/admin" },
  { name: "Scenario Editor", href: "/editor" },
  { name: "Leaderboard", href: "/leaderboard" },
  { name: "Insights", href: "/insights" },
];

export function TabsNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-white/15 bg-white/7">
      <div className="max-w-7xl mx-auto px-6">
        <nav className="flex gap-1">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                  isActive
                    ? "border-[#64BA00] text-white"
                    : "border-transparent text-gray-400 hover:text-gray-200 hover:border-white/20"
                }`}
              >
                {tab.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
