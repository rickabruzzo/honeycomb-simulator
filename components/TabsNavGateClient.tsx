"use client";

import { usePathname } from "next/navigation";
import { TabsNav } from "@/components/TabsNav";
import { showAdminTabs } from "@/lib/auth/tabsVisibility";

export function TabsNavGateClient({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  if (!showAdminTabs(pathname, isAdmin)) return null;
  return <TabsNav />;
}
