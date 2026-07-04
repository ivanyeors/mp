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

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">{displayName}</p>
        {email && displayName !== email ? (
          <p className="text-sm text-muted-foreground">{email}</p>
        ) : null}
      </div>

      <AccountSecurity email={email} googleLinked={googleLinked} />

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Session</h2>
        <p className="text-sm text-muted-foreground">
          Sign out to end this session on this device.
        </p>
        <form
          action={`/auth/signout?next=${encodeURIComponent(withLocale("/", locale))}`}
          method="post"
        >
          <Button type="submit" variant="outline" className="w-full sm:w-auto">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
