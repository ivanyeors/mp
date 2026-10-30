import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { readApiConfigs, toClientApiConfig } from "@/lib/settings/api-configs";
import { claudeCredentialSource } from "@/lib/ai/claude";
import GeneralSettingsPage from "./general-client";

export const runtime = "nodejs";

/**
 * The API configs come from the same tag-cached service-role read that backs
 * `/api/settings/api-configs`, so the page mounts with its list instead of
 * fetching it after hydration, and with where Claude's credentials come from.
 */
export default async function GeneralSettingsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("api-configs", locale);

  // A failed read must not look like "no API configs": leave `initialData`
  // undefined so the client runs its own mount fetch and surfaces the error.
  const [configs, claudeCredentials] = await Promise.all([
    readApiConfigs()
      .then((rows) => rows.map(toClientApiConfig))
      .catch(() => null),
    claudeCredentialSource(),
  ]);
  return <GeneralSettingsPage initialData={configs ?? undefined} claudeCredentials={claudeCredentials} />;
}
