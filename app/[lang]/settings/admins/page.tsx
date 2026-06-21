import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { AdminsClient } from "./admins-client";

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  // Only owners/admins (the "staff" permission) may manage staff and roles.
  await requireAdminPage("staff", locale);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin users &amp; roles</h1>
        <p className="text-sm text-muted-foreground">
          Invite staff by email, change their role, or revoke access. Invited
          staff gain access the next time they sign in with that email.
        </p>
      </div>
      <AdminsClient />
    </div>
  );
}
