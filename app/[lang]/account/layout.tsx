import { AccountSidebarNav } from "@/components/account/account-sidebar-nav";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountSidebarNav>{children}</AccountSidebarNav>;
}
