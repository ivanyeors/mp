import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAuthUser } from "@/lib/auth/user";
import { LoginForm } from "@/components/auth/login-form";

export default async function AccountLoginPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const accountHref = withLocale("/account", locale);

  // Already signed in → straight to the account area.
  const user = await getAuthUser();
  if (user) redirect(accountHref);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-4 py-16">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to your account</h1>
        <p className="text-sm text-muted-foreground">
          Access your order history, tracking, and saved addresses.
        </p>
      </div>
      <div className="mt-8">
        <LoginForm nextPath={accountHref} />
      </div>
    </main>
  );
}
