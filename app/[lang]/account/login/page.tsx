import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAdminContext } from "@/lib/auth/admin";
import { resolvePostAuthRedirect, safeNextPath } from "@/lib/auth/post-auth-redirect";
import {
  audienceForPath,
  isSignInError,
  isUnder,
  signInTabFor,
  SIGN_IN_ERRORS,
} from "@/lib/auth/sign-in-intent";
import { getAuthUser } from "@/lib/auth/user";
import { LoginForm } from "@/components/auth/login-form";
import { SignInTabs } from "@/components/auth/sign-in-tabs";
import { Button } from "@/components/ui/button";

/**
 * Sign in (PRD-campaign-audiences slice 03). Two tabs: **Customer**, the
 * default, where signing in and signing up are the same step, and **Staff**
 * for the Admin Panel. The Partner Hub (a `/partner` destination) has its own
 * single form, as before.
 *
 * Query: `next` (where to go after), `as` (`customer` or `staff`), `email`
 * (prefill), `sent=1` with `consent=newsletter` (the footer already sent the
 * link: open on the code step), `error` (why a sign-in came back), `reauth`
 * (the Partner Hub's 7-day cap).
 */
export default async function AccountLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{
    email?: string;
    next?: string;
    reauth?: string;
    as?: string;
    sent?: string;
    consent?: string;
    error?: string;
  }>;
}) {
  const { lang } = await params;
  const { email, next, reauth, as, sent, consent, error } = await searchParams;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const accountHref = withLocale("/account", locale);
  const adminHref = withLocale("/settings", locale);
  const nextPath = safeNextPath(next, accountHref);
  const tab = signInTabFor({ as, next });
  const partner = audienceForPath(next) === "partner" && as !== "staff";

  const user = await getAuthUser();
  const isStaff = user ? Boolean(await getAdminContext()) : false;

  // Signed in on the Staff tab, but not Staff: say so rather than bouncing them
  // to their Profile with no word why.
  if (user && tab === "staff" && !isStaff && !partner) {
    const back = withLocale(`/account/login?as=staff&next=${encodeURIComponent(adminHref)}`, locale);
    return (
      <Frame title="Staff sign in">
        <div className="space-y-4 rounded-lg border p-6 text-center">
          <p className="font-medium">
            You&apos;re signed in as <span className="break-all">{user.email}</span>.
          </p>
          <p className="text-sm text-muted-foreground">{SIGN_IN_ERRORS.not_staff}</p>
          <form action={`/auth/signout?next=${encodeURIComponent(back)}`} method="post">
            <Button type="submit" className="w-full">
              Sign out and use a Staff email
            </Button>
          </form>
          <Button asChild variant="ghost" className="w-full">
            <a href={accountHref}>Go to my account</a>
          </Button>
        </div>
      </Frame>
    );
  }

  // `reauth=1` (partner 7-day cap) forces the form even when a session exists —
  // signing in again refreshes `last_sign_in_at`. Without it we bounce as usual.
  if (user && !reauth) {
    redirect(
      resolvePostAuthRedirect({
        next: nextPath,
        isStaff,
        accountHome: accountHref,
        adminHome: adminHref,
      }),
    );
  }

  const prefill = (email ?? "").trim();

  if (partner) {
    return (
      <Frame
        title="Sign in to the Partner Hub"
        subtitle={
          reauth
            ? "Your Partner Hub session has expired. Please sign in again to continue."
            : "Use Google or an emailed link and code to continue."
        }
      >
        <LoginForm audience="partner" nextPath={nextPath} initialEmail={prefill} />
      </Frame>
    );
  }

  const errorMessage = isSignInError(error) ? SIGN_IN_ERRORS[error] : null;
  // Each tab carries its own heading (the page's h1): one form at a time is shown.
  return (
    <Frame>
      <SignInTabs
        initialTab={tab}
        tabFixed={as === "staff" || as === "customer" || isUnder(nextPath, "/settings")}
        customer={{
          nextPath: isUnder(nextPath, "/settings") ? accountHref : nextPath,
          initialEmail: tab === "customer" ? prefill : "",
          initialSent: tab === "customer" && sent === "1" && Boolean(prefill),
          consent: consent === "newsletter" ? "newsletter" : undefined,
        }}
        staff={{
          nextPath: isUnder(nextPath, "/settings") ? nextPath : adminHref,
          initialEmail: tab === "staff" ? prefill : "",
        }}
        error={errorMessage ? { tab, message: errorMessage } : null}
      />
    </Frame>
  );
}

function Frame({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-16">
      {title ? (
        <div className="mb-8 space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      ) : null}
      <div>{children}</div>
    </main>
  );
}
