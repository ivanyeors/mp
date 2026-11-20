import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { readApiConfigs, toClientApiConfig } from "@/lib/settings/api-configs";
import { claudeCredentialSource } from "@/lib/ai/claude";
import GeneralSettingsPage from "./general-client";

export const runtime = "nodejs";

export default async function GeneralSettingsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("api-configs", locale);

  const [configs, claudeCredentials] = await Promise.all([
    readApiConfigs()
      .then((rows) => rows.map(toClientApiConfig))
      .catch(() => null),
    claudeCredentialSource(),
  ]);
  return <GeneralSettingsPage initialData={configs ?? undefined} claudeCredentials={claudeCredentials} />;
}
