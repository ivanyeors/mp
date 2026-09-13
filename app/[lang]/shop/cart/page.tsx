import { CartPageClient } from "@/components/shop/cart-page-client";
import { getMessages } from "@/lib/i18n/messages";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";

interface CartPageProps {
  params: Promise<{ lang: string }>;
}

export default async function CartPage({ params }: CartPageProps) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  // Only the plain-string dictionary crosses into the client component. The
  // formatted `CartMessages` shape holds functions, which React cannot pass
  // from a server component to a client component — building it here is what
  // threw "Functions cannot be passed directly to Client Components" and took
  // the whole cart page down. The client builds it from these strings instead.
  return <CartPageClient dictionary={getMessages(locale).shop.cart} locale={locale} />;
}
