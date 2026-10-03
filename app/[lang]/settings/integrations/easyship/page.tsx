import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { readEasyshipConfig } from "@/lib/easyship/store";
import { webhookEndpoint } from "@/lib/easyship/sync";
import EasyshipSettingsPage from "./easyship-client";

export const runtime = "nodejs";

export default async function EasyshipSettingsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("shipping", locale);

  // A failed read must not look like "nothing saved": the client then shows the error path.
  const cfg = await readEasyshipConfig().catch(() => null);
  const initial = cfg
    ? {
        settings: cfg.settings,
        sync: {
          last_at: cfg.sync.last_at,
          report: cfg.sync.report,
          easyship_company_id: cfg.sync.easyship_company_id,
          webhook_secret_set: !!cfg.sync.webhook_secret_token,
        },
        webhook_endpoint: webhookEndpoint(),
      }
    : undefined;
  return <EasyshipSettingsPage initial={initial} />;
}
