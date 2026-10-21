import type { Metadata } from "next";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { openClaimLink } from "@/lib/customer-migration/claim-link";
import { loadWelcomePage } from "@/lib/customer-migration/welcome-page";
import { readWelcomeVoucher } from "@/lib/customer-migration/welcome-voucher";
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

/**
 * Where a campaign email's Claim link lands (PRD-shopify-customer-migration
 * slice 06; ADR 0028 decision 7). The token only chooses whose email to
 * prefill and records the click: it never signs anyone in. The account shell
 * leaves this page bare, as it does the sign-in page, so a signed-out visitor
 * is not redirected away from it.
 */
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
      readVoucher: (customerId) => readWelcomeVoucher(admin, customerId),
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
