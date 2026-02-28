"use client";

import { usePathname } from "next/navigation";

import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import { getLocaleFromPathname } from "@/lib/i18n/routing";

export function useI18n() {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const m = getMessages(locale);
  return { locale, m };
}

