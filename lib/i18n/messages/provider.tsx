"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Locale } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n/messages/types";

type Provided = { locale: Locale; messages: Messages } | null;

const I18nMessagesContext = createContext<Provided>(null);

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
