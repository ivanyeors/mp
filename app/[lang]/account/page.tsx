import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { AccountSecurity } from "@/components/auth/account-security";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function initialsFrom(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length > 0 && parts[0] !== email) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (email.slice(0, 2) || "?").toUpperCase();
}

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
  const phone = customer.phone?.trim() || null;
  const googleLinked = (user.identities ?? []).some((i) => i.provider === "google");
  const initials = initialsFrom(displayName, email);

  return (
    <div className="w-full max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage how you sign in to your account.
        </p>
      </div>

      <div className="flex items-center gap-4 rounded-lg border p-5 sm:p-6">
        <Avatar className="size-14 shrink-0">
          <AvatarFallback className="text-base font-medium">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-0.5">
          <p className="truncate font-medium leading-snug">{displayName}</p>
          {email && displayName !== email ? (
            <p className="truncate text-sm text-muted-foreground">{email}</p>
          ) : null}
          {phone ? (
            <p className="truncate text-sm text-muted-foreground">{phone}</p>
          ) : null}
        </div>
      </div>

      <AccountSecurity email={email} googleLinked={googleLinked} />

      <Separator />

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
