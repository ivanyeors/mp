import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { PAGE_META } from "@/lib/seo/page-meta";

type Props = {
  params: Promise<{ lang: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  return buildPageMetadata({
    ...PAGE_META.shop[locale],
    path: "/shop",
    lang: locale,
    keywords: ["Mpillow shop", "pillow accessories Singapore", "cervical support"],
  });
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
