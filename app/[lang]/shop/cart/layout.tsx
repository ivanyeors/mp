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
    title: "Cart",
    description: "Your Mpillow shopping cart",
    path: "/shop/cart",
    lang: locale,
    noindex: true,
  });
}

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
