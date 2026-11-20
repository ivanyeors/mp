import { getAdminContext } from "@/lib/auth/admin";
import { getWorkingAs, memberProfiles } from "@/lib/staff/working-as";
import { SettingsSidebarNav } from "@/components/settings/settings-sidebar-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAdminContext();
  const [profiles, workingAs] = ctx
    ? await Promise.all([memberProfiles(ctx.memberId), getWorkingAs(ctx.memberId)])
    : [[], null];
  const initialAuth = ctx
    ? {
        signedIn: true as const,
        permissions: [...ctx.permissions],
        workingAs: { profiles, current: workingAs?.id ?? null },
      }
    : { signedIn: false as const, permissions: [] };
  return <SettingsSidebarNav initialAuth={initialAuth}>{children}</SettingsSidebarNav>;
}
