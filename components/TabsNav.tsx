"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const tabs = [
  { name: "Scenario Builder", href: "/" },
  { name: "Scenario Tracker", href: "/admin" },
  { name: "Scenario Editor", href: "/editor" },
  { name: "Leaderboard", href: "/leaderboard" },
  { name: "Insights", href: "/insights" },
];

export function TabsNav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleBuilderClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Force fresh bootstrap fetch by adding timestamp to URL
    router.push(`/?ts=${Date.now()}`);
  };

  return (
    <div className="border-b border-white/15 bg-white/7">
      <div className="max-w-7xl mx-auto px-6">
        <nav className="flex gap-1">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            const isBuilder = tab.href === "/";

            // For Scenario Builder, use button with onClick to force refresh
            if (isBuilder) {
              return (
                <button
                  key={tab.href}
                  onClick={handleBuilderClick}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                    isActive
                      ? "border-[#64BA00] text-white"
                      : "border-transparent text-gray-400 hover:text-gray-200 hover:border-white/20"
                  }`}
                >
                  {tab.name}
                </button>
              );
            }

            // Other tabs use regular Link
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
