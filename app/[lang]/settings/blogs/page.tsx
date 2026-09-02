import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { listAdminBlogPosts } from "@/lib/blogs";
import SettingsBlogsPage from "./blogs-client";

export const runtime = "nodejs";

/**
 * The blog list is assembled on the server (same rows `/api/blogs` returns) so
 * the client mounts with its data instead of fetching it after hydration.
 */
export default async function BlogsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("blogs", locale);

  // A failed read must not look like "no posts": leave `initialData` undefined
  // so the client runs its own mount fetch and surfaces the error.
  const rows = await listAdminBlogPosts().catch(() => null);
  return <SettingsBlogsPage initialData={rows ? { ok: true, rows } : undefined} />;
}
