import { getAdminContext } from "@/lib/auth/admin";
import { permissionsForRole } from "@/lib/auth/permissions";
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
  const initialAuth = ctx
    ? { signedIn: true as const, permissions: permissionsForRole(ctx.role) }
    : { signedIn: false as const, permissions: [] };
  return <SettingsSidebarNav initialAuth={initialAuth}>{children}</SettingsSidebarNav>;
}
