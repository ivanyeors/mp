import { AccountSidebarNav } from "@/components/account/account-sidebar-nav";
import { getAuthUser } from "@/lib/auth/user";

/**
 * Signed-in users get the account shell (same as /account).
 * Guests (token links) get the bare status page — no shell flip on the client.
 */
export default async function ResultsLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) return children;
  return <AccountSidebarNav>{children}</AccountSidebarNav>;
}
