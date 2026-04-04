import { SettingsSidebarNav } from "@/components/settings/settings-sidebar-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsSidebarNav>{children}</SettingsSidebarNav>;
}
