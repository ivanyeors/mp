import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAuthUser } from "@/lib/auth/user";
import { LoginForm } from "@/components/auth/login-form";

function safeNextPath(next: string | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

export default async function AccountLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ email?: string; next?: string }>;
}) {
  const { lang } = await params;
  const { email, next } = await searchParams;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const accountHref = withLocale("/account", locale);
  const nextPath = safeNextPath(next, accountHref);

  // Already signed in → destination (result status or account).
  const user = await getAuthUser();
  if (user) redirect(nextPath);

  const prefill = (email ?? "").trim();
  const fromResult = Boolean(prefill) || nextPath.includes("/results/");

  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-4 py-16">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {fromResult ? "Create your account" : "Sign in to your account"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {fromResult
            ? "Use a magic link to track this customisation and your orders."
            : "Access your order history, tracking, and saved addresses."}
        </p>
      </div>
      <div className="mt-8">
        <LoginForm nextPath={nextPath} initialEmail={prefill} />
      </div>
    </main>
  );
}
