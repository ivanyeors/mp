import { AccountSidebarNav } from "@/components/account/account-sidebar-nav";
import { getAuthUser } from "@/lib/auth/user";

export default async function ResultsLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) return children;
  return <AccountSidebarNav>{children}</AccountSidebarNav>;
}
