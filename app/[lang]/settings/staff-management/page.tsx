import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { listStaffRows } from "@/lib/staff/admin";
import { listTelegramOperators } from "@/lib/telegram/operators";
import StaffManagementPage from "./staff-management-client";

export const runtime = "nodejs";

/**
 * The staff list is read on the server (the same rows `/api/staff` returns) so
 * the table mounts filled instead of fetching after hydration.
 *
 * The Telegram access tab (who may act on review cards in the measurements
 * group) is owners/admins only — the `users` permission, as for Admin Users —
 * because a review manager speaks for the business on Google Maps.
 */
export default async function StaffManagementRoute({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const ctx = await requireAdminPage("results", locale);
  const canManageTelegram = hasPermission(ctx, "users");
  const { tab } = await searchParams;

  // A failed read must not look like "no staff": leave `initialData` undefined
  // so the client runs its own mount fetch and surfaces the error.
  const [rows, operators] = await Promise.all([
    listStaffRows().catch(() => null),
    canManageTelegram ? listTelegramOperators().catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <StaffManagementPage
      initialData={rows ? { ok: true, rows } : undefined}
      telegram={canManageTelegram ? { initialRows: operators ?? undefined } : null}
      initialTab={canManageTelegram && tab === "telegram" ? "telegram" : "staff"}
    />
  );
}
