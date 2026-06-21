import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { getCustomerAddresses } from "@/lib/shop/customer-addresses";
import { AddressesClient } from "./addresses-client";

export const metadata = {
  title: "Saved addresses",
};

export default async function AccountAddressesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const user = await getAuthUser();
  if (!user) redirect(withLocale("/account/login", locale));

  // Ensure the auth user is linked to a customer so RLS can resolve addresses.
  await linkCustomerToAuthUser(user);
  const addresses = await getCustomerAddresses();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
      <div className="space-y-1">
        <Link
          href={withLocale("/account", locale)}
          className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Account
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Saved addresses</h1>
        <p className="text-sm text-muted-foreground">
          Manage the shipping addresses you can reuse at checkout.
        </p>
      </div>

      <AddressesClient addresses={addresses} />
    </main>
  );
}
