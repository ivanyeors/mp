import type { LocalizedShippingContent } from "@/lib/types/ecommerce";

type MethodContent = Record<string, Partial<LocalizedShippingContent> | undefined> | null | undefined;

/**
 * The delivery time Staff wrote on a **Shipping method** (its `estimated_days`,
 * e.g. "About 2 weeks"), in the shopper's language, else in English. Null when
 * no language has one.
 */
export function methodDeliveryTime(content: MethodContent, locale: string): string | null {
  if (!content) return null;
  for (const key of [locale, "en-US", "en"]) {
    const text = content[key]?.estimated_days?.trim();
    if (text) return text;
  }
  return null;
}

/**
 * What a shopper is told about how long a method takes: the delivery time Staff
 * set on the method when there is one, else the courier's transit window. Staff
 * know things a courier's estimate does not (a slow service, a consolidation
 * week), so their words win on every surface that lists methods: checkout, the
 * configurators and the delivery checker.
 */
export function shownDeliveryTime(
  content: MethodContent,
  locale: string,
  courierWindow: string | null,
): string | null {
  return methodDeliveryTime(content, locale) ?? courierWindow;
}
