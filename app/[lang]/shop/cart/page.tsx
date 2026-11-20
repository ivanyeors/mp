import { CartPageClient } from "@/components/shop/cart-page-client";
import { getMessages } from "@/lib/i18n/messages";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";

interface CartPageProps {
  params: Promise<{ lang: string }>;
}

export default async function CartPage({ params }: CartPageProps) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  return <CartPageClient dictionary={getMessages(locale).shop.cart} locale={locale} />;
}
