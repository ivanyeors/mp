import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { readApiConfigs, toClientApiConfig } from "@/lib/settings/api-configs";
import { claudeCredentialSource } from "@/lib/ai/claude";
import { readAiWritingSettings } from "@/lib/ai/settings";
import { readAiUsageThisMonth } from "@/lib/ai/usage";
import { supabaseAdmin } from "@/lib/supabase/server";
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

  const [configs, claudeCredentials, aiWritingRead, aiUsage] = await Promise.all([
    readApiConfigs()
      .then((rows) => rows.map(toClientApiConfig))
      .catch(() => null),
    claudeCredentialSource(),
    readAiWritingSettings(),
    Promise.resolve()
      .then(() => readAiUsageThisMonth(supabaseAdmin()))
      .catch((err: unknown) => {
        console.error("[ai-writing] usage read failed:", err instanceof Error ? err.message : err);
        return null;
      }),
  ]);
  return (
    <GeneralSettingsPage
      initialData={configs ?? undefined}
      claudeCredentials={claudeCredentials}
      aiWriting={aiWritingRead.ok ? { settings: aiWritingRead.settings, usage: aiUsage } : { error: aiWritingRead.error }}
    />
  );
}
