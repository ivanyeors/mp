import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";

type Props = {
  params: Promise<{ lang: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  return buildPageMetadata({
    title: "Checkout",
    description: "Mpillow checkout",
    path: "/shop/checkout",
    lang: locale,
    noindex: true,
  });
}

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
