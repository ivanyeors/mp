import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { enUS } from "@/lib/i18n/messages/en-US";
import { zhCN } from "@/lib/i18n/messages/zh-CN";

const MESSAGES: Record<Locale, typeof enUS> = {
  "en-US": enUS,
  "zh-CN": zhCN,
};

export function getMessages(locale: Locale) {
  return MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
}

