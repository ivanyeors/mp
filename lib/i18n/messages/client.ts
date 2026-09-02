"use client";

// Client-only message loading. `lib/i18n/messages/index.ts` statically imports
// every locale, which is fine on the server but ships all dictionaries to the
// browser. Here only the default locale (en-US, also the fallback) is static;
// other locales are fetched lazily and memoised at module scope so that
// subsequent mounts read them synchronously during render.

import { useEffect, useState } from "react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { enUS } from "@/lib/i18n/messages/en-US";
import { useProvidedMessages } from "@/lib/i18n/messages/provider";
import type { Messages } from "@/lib/i18n/messages/types";

const CACHE: Partial<Record<Locale, Messages>> = {
  [DEFAULT_LOCALE]: enUS,
};

/** Synchronous read: the requested locale if already loaded, else the fallback. */
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

/**
 * Messages for `locale`, falling back to en-US until the locale's dictionary
 * has been loaded. Returns `Messages` synchronously on every render.
 */
export function useMessages(locale: Locale): Messages {
  const [, setVersion] = useState(0);
  const provided = useProvidedMessages();
  // A dictionary handed down by the server layout is authoritative for its
  // locale and is also seeded into the cache so sibling mounts read it
  // synchronously.
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
