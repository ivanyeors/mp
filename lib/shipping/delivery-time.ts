import type { LocalizedShippingContent } from "@/lib/types/ecommerce";

type MethodContent = Record<string, Partial<LocalizedShippingContent> | undefined> | null | undefined;

export function methodDeliveryTime(content: MethodContent, locale: string): string | null {
  if (!content) return null;
  for (const key of [locale, "en-US", "en"]) {
    const text = content[key]?.estimated_days?.trim();
    if (text) return text;
  }
  return null;
}

export function shownDeliveryTime(
  content: MethodContent,
  locale: string,
  courierWindow: string | null,
): string | null {
  return methodDeliveryTime(content, locale) ?? courierWindow;
}
