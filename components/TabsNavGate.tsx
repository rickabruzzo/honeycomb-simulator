"use client";

import { usePathname } from "next/navigation";
import { TabsNav } from "@/components/TabsNav"; // adjust path to your actual TabsNav

export function TabsNavGate() {
  const pathname = usePathname();
  // Hide tabs on trainee sessions and shared leaderboard
  if (pathname?.startsWith("/s/") || pathname === "/leaderboard/share") {
    return null;
  }
  return <TabsNav />;
}