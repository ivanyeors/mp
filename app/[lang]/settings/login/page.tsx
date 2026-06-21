import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAdminContext } from "@/lib/auth/admin";
import { LoginForm } from "@/components/auth/login-form";

export default async function SettingsLoginPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const settingsHref = withLocale("/settings", locale);

  // Already an authorized staff member → go to the back office.
  const ctx = await getAdminContext();
  if (ctx) redirect(settingsHref);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Staff sign in</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with your authorized staff account to access the back office.
        </p>
      </div>
      <div className="mt-8">
        <LoginForm nextPath={settingsHref} allowEmailLink={false} />
      </div>
    </main>
  );
}
