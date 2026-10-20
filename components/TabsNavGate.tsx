"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { TabsNav } from "@/components/TabsNav"; // adjust path to your actual TabsNav

export function TabsNavGate() {
  const pathname = usePathname();
  // The study guide is both an admin tab and where trainees go from the quiz; trainee links carry
  // ?trainee=1 so they don't land on the admin tabs. Read from location directly (no Suspense
  // boundary needed, unlike useSearchParams); the server snapshot hides nothing.
  const search = useSyncExternalStore(
    () => () => {},
    () => window.location.search,
    () => ""
  );
  const traineeView = new URLSearchParams(search).has("trainee");

  // Hide the admin tabs on everything a trainee or a share-link viewer can land on:
  // the practice session, the quiz, the scorecard, and the shared leaderboard/insights views.
  if (
    pathname?.startsWith("/s/") ||
    pathname?.startsWith("/q/") ||
    pathname?.startsWith("/share/") ||
    (pathname === "/study" && traineeView) ||
    pathname === "/leaderboard/share" ||
    pathname === "/insights/share"
  ) {
    return null;
  }
  return <TabsNav />;
}
