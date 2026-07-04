import Link from "next/link";
import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { AccountSecurity } from "@/components/auth/account-security";
import { Button } from "@/components/ui/button";

export default async function AccountProfilePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const user = await getAuthUser();
  if (!user) redirect(withLocale("/account/login", locale));

  const customer = await linkCustomerToAuthUser(user);
  const email = customer.email || user.email || "";
  const displayName =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") || email;
  const googleLinked = (user.identities ?? []).some((i) => i.provider === "google");

  const resultsHref = withLocale("/results", locale);
  const ordersHref = withLocale("/account/orders", locale);
  const addressesHref = withLocale("/account/addresses", locale);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 md:py-16">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-muted-foreground">{displayName}</p>
          {email && displayName !== email ? (
            <p className="text-sm text-muted-foreground">{email}</p>
          ) : null}
        </div>
        <form
          action={`/auth/signout?next=${encodeURIComponent(withLocale("/", locale))}`}
          method="post"
        >
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-medium">Your account</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={resultsHref}
            className="rounded-lg border p-4 transition-colors hover:bg-muted/40 sm:col-span-2"
          >
            <h3 className="font-medium">Results</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Track customisation reviews and authorization holds.
            </p>
          </Link>
          <Link
            href={ordersHref}
            className="rounded-lg border p-4 transition-colors hover:bg-muted/40"
          >
            <h3 className="font-medium">Orders</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Order history, status, and tracking.
            </p>
          </Link>
          <Link
            href={addressesHref}
            className="rounded-lg border p-4 transition-colors hover:bg-muted/40"
          >
            <h3 className="font-medium">Addresses</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Saved shipping addresses.
            </p>
          </Link>
        </div>
      </section>

      <div className="mt-10">
        <AccountSecurity email={email} googleLinked={googleLinked} />
      </div>
    </main>
  );
}
