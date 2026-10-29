import { auth } from "@/auth";
import { authDisabled, isAdminEmail } from "@/lib/auth/policy";
import { TabsNavGateClient } from "@/components/TabsNavGateClient";

/**
 * Decides server-side whether the visitor is an admin (every signed-in colleague is, unless
 * ADMIN_EMAILS narrows it; local dev with AUTH_MODE=off counts too) and lets the client gate pick
 * the pages the tabs appear on.
 */
export async function TabsNavGate() {
  const session = await auth().catch(() => null);
  const isAdmin = authDisabled() || isAdminEmail(session?.user?.email);
  return <TabsNavGateClient isAdmin={isAdmin} />;
}
