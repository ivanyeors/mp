import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listAdminBlogPosts } from "@/lib/blogs";
import SettingsBlogsPage from "./blogs-client";

export const runtime = "nodejs";

export default async function BlogsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("blogs", locale);

  const rows = await listAdminBlogPosts().catch(() => null);
  return <SettingsBlogsPage initialData={rows ? { ok: true, rows } : undefined} />;
}
