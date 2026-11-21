"use client";

import { useEffect, useState } from "react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { enUS } from "@/lib/i18n/messages/en-US";
import { useProvidedMessages } from "@/lib/i18n/messages/provider";
import type { Messages } from "@/lib/i18n/messages/types";

const CACHE: Partial<Record<Locale, Messages>> = {
  [DEFAULT_LOCALE]: enUS,
};

export function getLoadedMessages(locale: Locale): Messages {
  return CACHE[locale] ?? enUS;
}

async function loadLocale(locale: Locale): Promise<Messages | null> {
  switch (locale) {
    case "zh-CN": {
      const mod = await import("@/lib/i18n/messages/zh-CN");
      return mod.zhCN;
    }
    default:
      return null;
  }
}

export function useMessages(locale: Locale): Messages {
  const [, setVersion] = useState(0);
  const provided = useProvidedMessages();
  if (provided && provided.locale === locale && !CACHE[locale]) {
    CACHE[locale] = provided.messages;
  }

  useEffect(() => {
    if (CACHE[locale]) return;
    let cancelled = false;
    void loadLocale(locale).then((messages) => {
      if (!messages) return;
      CACHE[locale] = messages;
      if (!cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (provided && provided.locale === locale) return provided.messages;
  return getLoadedMessages(locale);
}
