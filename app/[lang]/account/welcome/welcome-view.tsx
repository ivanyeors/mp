import Link from "next/link";
import { CalendarClock, ClipboardList, MapPin, RotateCcw, ShoppingCart } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { ClaimBonusCard } from "@/components/account/claim-bonus-card";
import { Button } from "@/components/ui/button";
import { welcomePath } from "@/lib/customer-migration/claim-link";
import type { WelcomeAccount, WelcomePageData } from "@/lib/customer-migration/welcome-page";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

/**
 * The welcome page's three screens (PRD-shopify-customer-migration slice 06).
 * The state is chosen by `selectWelcomeState`; this only renders it. The
 * signed-out screen embeds `LoginForm` exactly as the Result status page does,
 * returning here, so the visitor still signs in with Google or the code.
 */
export function WelcomeView({ locale, data }: { locale: Locale; data: WelcomePageData }) {
  const { state } = data;

  if (state.kind === "signed_out") {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-16">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {state.firstName ? `Welcome back, ${state.firstName}.` : "Welcome back."}
          </h1>
          <p>Your Mpillow account is ready.</p>
          <p className="text-sm text-muted-foreground">
            Sign in with the email you shopped with. There is no password to set.
          </p>
        </div>
        <div className="mt-8">
          <LoginForm
            nextPath={welcomePath(locale, state.returnToken)}
            initialEmail={state.prefillEmail}
            submitLabel="Email me a sign-in code"
          />
        </div>
      </main>
    );
  }

  if (state.kind === "wrong_account") {
    // The token's Customer is not this visitor: nothing of theirs is shown.
    const back = welcomePath(locale, state.returnToken);
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-16">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            You&apos;re signed in as <span className="break-all">{state.signedInEmail}</span>.
          </h1>
          <p className="text-sm text-muted-foreground">
            This link is for the account of the email you shopped with. Sign in with that email to see it.
          </p>
        </div>
        <div className="mt-8 space-y-3">
          {/* Signs out and comes back here, where the form is prefilled. Not
              /account/login?reauth=1: that is the Partner Hub's session cap. */}
          <form action={`/auth/signout?next=${encodeURIComponent(back)}`} method="post">
            <Button type="submit" className="w-full">
              Use another account
            </Button>
          </form>
          <Button asChild variant="ghost" className="w-full">
            <Link href={withLocale("/account", locale)}>Continue to my account</Link>
          </Button>
        </div>
      </main>
    );
  }

  return <SignedIn locale={locale} account={data.account} />;
}

type Feature = { href: string; Icon: LucideIcon; title: string; body: string };

function SignedIn({ locale, account }: { locale: Locale; account: WelcomeAccount | null }) {
  const to = (href: string) => withLocale(href, locale);
  const features: Feature[] = [
    {
      href: "/account/addresses",
      Icon: MapPin,
      title: "Addresses",
      body: account?.hasAddress
        ? "Your delivery address is already saved."
        : "Save a delivery address for a faster checkout.",
    },
    { href: "/account/orders", Icon: ShoppingCart, title: "Orders", body: "Follow your orders and their delivery." },
    {
      href: "/appointments?type=readjustment",
      Icon: CalendarClock,
      title: "Re-adjustment",
      body: "Book a re-adjustment for your pillow.",
    },
    { href: "/results", Icon: ClipboardList, title: "Results", body: "Your custom builds and where each one is." },
    { href: "/account/orders", Icon: RotateCcw, title: "Returns", body: "Start a return from the order it belongs to." },
  ];

  return (
    <main className="mx-auto w-full max-w-xl space-y-8 px-4 py-12 sm:py-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {account?.firstName ? `Welcome back, ${account.firstName}.` : "Welcome back."}
        </h1>
        <p className="text-sm text-muted-foreground">
          Your Mpillow account is ready
          {account?.email ? (
            <>
              , and you&apos;re signed in as <span className="break-all text-foreground">{account.email}</span>
            </>
          ) : null}
          .
        </p>
      </div>

      {account?.bonus ? <ClaimBonusCard bonus={account.bonus} shopHref={to("/shop")} termsHref={to("/points")} /> : null}

      <section aria-labelledby="welcome-account-title" className="space-y-3">
        <h2 id="welcome-account-title" className="text-sm font-medium">
          What your account does
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {features.map(({ href, Icon, title, body }) => (
            <li key={title}>
              <Link
                href={to(href)}
                className="flex h-full items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-sm text-muted-foreground">{body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Button asChild variant="outline" className="w-full sm:w-auto">
        <Link href={to("/account")}>Go to my account</Link>
      </Button>
    </main>
  );
}
