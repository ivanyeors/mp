import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { supabaseAdmin } from "@/lib/supabase/server";
import { readProfileAftercare } from "@/lib/aftercare/preferences";
import { AccountSecurity } from "@/components/auth/account-security";
import { PointsCard } from "@/components/account/points-card";
import { isPartnerCustomer, readPendingOrders, readPointsBalance, readPointsSettings } from "@/lib/points/server";
import { AftercarePreferences } from "./aftercare-preferences";
import { readMarketingEmailState } from "@/lib/marketing-consent/consent";
import { MarketingEmailPreference } from "./marketing-email-preference";
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

/**
 * The session's own points (PRD-loyalty-points slice 02), only while points
 * are on and the Customer is not a partner (rule r). Read with the service role, keyed by the Customer this session just
 * linked, never by anything the request names. A failed read hides the card.
 */
async function readOwnPoints(admin: ReturnType<typeof supabaseAdmin>, customerId: string) {
  try {
    const settings = await readPointsSettings(admin);
    if (!settings.enabled || (await isPartnerCustomer(admin, customerId))) return null;
    const [balance, pending] = await Promise.all([readPointsBalance(admin, customerId), readPendingOrders(admin, customerId)]);
    return { balance, pending };
  } catch {
    return null;
  }
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
  // Read server-side by the session's own Customer (CRM slice 13), so the card
  // does not depend on the customer's column grants on `customers`. A failed
  // read hides the card rather than the whole Profile.
  const admin = supabaseAdmin();
  // Points (PRD-loyalty-points slice 02) are read after linkCustomerToAuthUser,
  // whose Claim may have just granted the Claim bonus. A failed read only
  // hides the card. Marketing consent (migration slice 07) is read the same
  // way as the aftercare switches.
  const [aftercare, marketingEmail, points] = await Promise.all([
    readProfileAftercare(admin, customer.id).catch(() => null),
    readMarketingEmailState(admin, customer.id).catch(() => null),
    readOwnPoints(admin, customer.id),
  ]);

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

      {points ? (
        <PointsCard
          balance={points.balance}
          pending={points.pending}
          termsHref={withLocale("/points", locale)}
          shopHref={withLocale("/shop", locale)}
        />
      ) : null}

      <AccountSecurity googleLinked={googleLinked} />

      {aftercare ? (
        <AftercarePreferences
          email={aftercare.email}
          whatsapp={aftercare.whatsapp}
          phone={aftercare.phone}
        />
      ) : null}

      {marketingEmail ? <MarketingEmailPreference state={marketingEmail} /> : null}

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
