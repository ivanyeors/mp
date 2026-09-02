import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { getAdminBlogPostById } from "@/lib/blogs";
import BlogEditorPage from "./blog-editor-client";

export const runtime = "nodejs";

/**
 * The post being edited is read on the server (same row `/api/blogs/[id]`
 * returns) so the editor mounts populated. `new` has nothing to load.
 */
export default async function BlogEditorRoute({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("blogs", locale);

  if (id === "new") return <BlogEditorPage />;

  const { row } = await getAdminBlogPostById(id);
  if (!row) return <BlogEditorPage />;
  return <BlogEditorPage initialData={{ ok: true, row }} />;
}
