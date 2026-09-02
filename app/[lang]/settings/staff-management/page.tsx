import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listStaffRows } from "@/lib/staff/admin";
import StaffManagementPage from "./staff-management-client";

export const runtime = "nodejs";

/**
 * The staff list is read on the server (the same rows `/api/staff` returns) so
 * the table mounts filled instead of fetching after hydration.
 */
export default async function StaffManagementRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("results", locale);

  const rows = await listStaffRows().catch(() => []);
  return <StaffManagementPage initialData={{ ok: true, rows }} />;
}
