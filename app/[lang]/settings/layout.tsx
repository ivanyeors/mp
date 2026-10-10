import { getAdminContext } from "@/lib/auth/admin";
import { getWorkingAs, memberProfiles } from "@/lib/staff/working-as";
import { SettingsSidebarNav } from "@/components/settings/settings-sidebar-nav";

/**
 * Admin Panel shell. The staff session is resolved here, on the server, so the
 * sidebar and the page render in the same pass instead of the browser waiting
 * on a `/api/admin/context` round trip before it may mount the page.
 *
 * `getAdminContext` is request-memoised, so an RSC page guard below this
 * layout reuses the same lookup.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAdminContext();
  // "Working as" only matters on a login with several Staff profiles.
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
