"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Locale } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n/messages/types";

type Provided = { locale: Locale; messages: Messages } | null;

const I18nMessagesContext = createContext<Provided>(null);

/**
 * Server-provided dictionary for the current locale.
 *
 * The `[lang]` layout renders this with the non-default locale's messages so
 * that server-rendered client components (landing sections, aftercare copy)
 * print the right language on first paint and hydrate without a mismatch.
 * en-US is the static fallback bundled with the client, so nothing is passed
 * for it and the RSC payload only grows on zh-CN pages.
 */
export function I18nMessagesProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages | null;
  children: ReactNode;
}) {
  const value: Provided = messages ? { locale, messages } : null;
  return <I18nMessagesContext.Provider value={value}>{children}</I18nMessagesContext.Provider>;
}

export function useProvidedMessages(): Provided {
  return useContext(I18nMessagesContext);
}
