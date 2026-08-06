import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAdminContext } from "@/lib/auth/admin";
import { resolvePostAuthRedirect, safeNextPath } from "@/lib/auth/post-auth-redirect";
import { getAuthUser } from "@/lib/auth/user";
import { LoginForm } from "@/components/auth/login-form";

export default async function AccountLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ email?: string; next?: string; reauth?: string }>;
}) {
  const { lang } = await params;
  const { email, next, reauth } = await searchParams;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const accountHref = withLocale("/account", locale);
  const adminHref = withLocale("/settings", locale);
  // Preserve next for OAuth; role routing runs after session (callback / already-signed-in).
  const nextPath = safeNextPath(next, accountHref);

  const user = await getAuthUser();
  // `reauth=1` (partner 7-day cap) forces the form even when a session exists —
  // signing in again refreshes `last_sign_in_at`. Without it we bounce as usual.
  if (user && !reauth) {
    redirect(
      resolvePostAuthRedirect({
        next: nextPath,
        isStaff: Boolean(await getAdminContext()),
        accountHome: accountHref,
        adminHome: adminHref,
      }),
    );
  }

  const prefill = (email ?? "").trim();

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign In</h1>
        <p className="text-sm text-muted-foreground">
          {reauth
            ? "Your Partner Hub session has expired. Please sign in again to continue."
            : "Use Google or a magic link to continue."}
        </p>
      </div>
      <div className="mt-8">
        <LoginForm nextPath={nextPath} initialEmail={prefill} />
      </div>
    </main>
  );
}
