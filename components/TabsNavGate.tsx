"use client";

import { usePathname } from "next/navigation";
import { TabsNav } from "@/components/TabsNav"; // adjust path to your actual TabsNav

export function TabsNavGate() {
  const pathname = usePathname();
  // Hide the admin tabs on everything a trainee or a share-link viewer can land on:
  // the practice session, the scorecard, and the shared leaderboard/insights views.
  if (
    pathname?.startsWith("/s/") ||
    pathname?.startsWith("/share/") ||
    pathname === "/leaderboard/share" ||
    pathname === "/insights/share"
  ) {
    return null;
  }
  return <TabsNav />;
}