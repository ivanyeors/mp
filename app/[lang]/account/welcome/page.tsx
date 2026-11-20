import type { Metadata } from "next";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { openClaimLink } from "@/lib/customer-migration/claim-link";
import { loadWelcomePage } from "@/lib/customer-migration/welcome-page";
import { readClaimBonusView } from "@/lib/points/claim-bonus";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { supabaseAdmin } from "@/lib/supabase/server";
import { WelcomeView } from "./welcome-view";

export const runtime = "nodejs";

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ c?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  return buildPageMetadata({
    title: "Welcome back",
    description: "Your Mpillow account is ready.",
    path: "/account/welcome",
    lang: locale,
    noindex: true,
  });
}

export default async function AccountWelcomePage({ params, searchParams }: Props) {
  const [{ lang }, { c }] = await Promise.all([params, searchParams]);
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const token = (Array.isArray(c) ? c[0] : c)?.trim() || null;
  const admin = supabaseAdmin();

  const data = await loadWelcomePage(
    { token },
    {
      getUser: getAuthUser,
      linkCustomer: linkCustomerToAuthUser,
      openLink: (t, options) => openClaimLink(admin, t, options),
      readBonus: (customerId) => readClaimBonusView(admin, customerId),
      hasAddress: async (customerId) => {
        const { count, error } = await admin
          .from("customer_addresses")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", customerId);
        return !error && (count ?? 0) > 0;
      },
    },
  );

  return <WelcomeView locale={locale} data={data} />;
}
