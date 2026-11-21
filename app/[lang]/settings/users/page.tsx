import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listMembers, listRoles } from "@/lib/auth/members";
import { listStaffProfiles } from "@/lib/staff/admin";
import { listTelegramLinks } from "@/lib/telegram/operators";
import { UsersClient } from "./users-client";
import { parseUsersTab } from "./tabs";

export const runtime = "nodejs";

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

  const [members, roles, profiles, operators] = await Promise.all([
    listMembers().catch(() => null),
    listRoles().catch(() => null),
    listStaffProfiles({ includeArchived: true }).catch(() => null),
    listTelegramLinks().catch(() => null),
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
      initialProfiles={profiles ?? undefined}
      initialTelegram={operators ?? undefined}
    />
  );
}
