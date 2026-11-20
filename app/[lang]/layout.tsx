import { notFound } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import { I18nMessagesProvider } from "@/lib/i18n/messages/provider";

export async function generateStaticParams() {
  return SUPPORTED_LOCALES.map((lang) => ({ lang }));
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isSupportedLocale(lang)) notFound();
  const messages = lang === DEFAULT_LOCALE ? null : getMessages(lang);
  return (
    <I18nMessagesProvider locale={lang} messages={messages}>
      {children}
    </I18nMessagesProvider>
  );
}
