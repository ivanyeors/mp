import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listMembers, listRoles } from "@/lib/auth/members";
import { listStaffRows } from "@/lib/staff/admin";
import { listTelegramOperators } from "@/lib/telegram/operators";
import { UsersClient, parseUsersTab } from "./users-client";

export const runtime = "nodejs";

/**
 * Users & permissions (ADR 0023): Members, Staff profiles, Roles and Telegram
 * on one page, like an organisation's settings. The whole page is the `users`
 * permission. Every tab mounts with its rows read here, so nothing fetches
 * after hydration; a failed read is passed as undefined so that tab fetches
 * and surfaces the error itself instead of looking empty.
 */
export default async function UsersPermissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const ctx = await requireAdminPage("users", locale);
  const { tab } = await searchParams;

  const [members, roles, staff, operators] = await Promise.all([
    listMembers().catch(() => null),
    listRoles().catch(() => null),
    listStaffRows().catch(() => null),
    listTelegramOperators().catch(() => null),
  ]);

  return (
    <UsersClient
      initialTab={parseUsersTab(tab)}
      actor={{
        memberId: ctx.memberId,
        isOwner: ctx.isOwner,
        grantsAll: ctx.grantsAll,
        permissions: [...ctx.permissions],
      }}
      initialMembers={members ?? undefined}
      initialRoles={roles ?? undefined}
      initialStaff={staff ? { ok: true, rows: staff } : undefined}
      initialTelegram={operators ?? undefined}
    />
  );
}
