import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { getAllFaqCategoriesAdmin, getAllFaqItemsAdmin } from "@/lib/faq";
import SettingsFaqPage from "./faq-client";

export const runtime = "nodejs";

/**
 * Categories and questions are read on the server (the same rows
 * `/api/faq/categories` and `/api/faq/items` return) so the page mounts with
 * both lists instead of fetching them after hydration.
 */
export default async function FaqSettingsRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("faq", locale);

  const [categories, items] = await Promise.all([
    getAllFaqCategoriesAdmin(),
    getAllFaqItemsAdmin(),
  ]);

  return (
    <SettingsFaqPage
      initialData={{
        categories: { ok: true, rows: categories },
        items: { ok: true, rows: items },
      }}
    />
  );
}
