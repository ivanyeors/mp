import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { enUS } from "@/lib/i18n/messages/en-US";
import { zhCN } from "@/lib/i18n/messages/zh-CN";
import type { Messages } from "@/lib/i18n/messages/types";

const MESSAGES: Record<Locale, Messages> = {
  "en-US": enUS,
  "zh-CN": zhCN,
};

export function getMessages(locale: Locale) {
  return MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
}

