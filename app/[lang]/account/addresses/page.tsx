import { redirect } from "next/navigation";
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

  await linkCustomerToAuthUser(user);
  const addresses = await getCustomerAddresses();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Addresses</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage the shipping addresses you can reuse at checkout.
        </p>
      </div>

      <AddressesClient addresses={addresses} />
    </div>
  );
}
