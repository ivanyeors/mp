import { CartPageClient } from "@/components/shop/cart-page-client";
import { buildCartMessages } from "@/lib/shop/cart-messages";
import { getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";

interface CartPageProps {
  params: Promise<{ lang: string }>;
}

export default async function CartPage({ params }: CartPageProps) {
  const { lang } = await params;
  const messages = buildCartMessages(getMessages(lang as Locale).shop.cart);

  return <CartPageClient messages={messages} locale={lang as Locale} />;
}
