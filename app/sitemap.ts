import { getProducts } from "@/lib/ecommerce/products";
import { getBlogPostsFromDb } from "@/lib/blogs";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { localeAlternates, localeUrl } from "@/lib/seo/locale-url";
import { ENGLISH_ONLY_PAGE_META } from "@/lib/seo/page-meta";
import type { MetadataRoute } from "next";

// Re-generate at most once an hour; product/blog content changes are not urgent for the sitemap.
export const revalidate = 3600;

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

/**
 * One <url> per locale the page exists in, each naming all of them plus
 * x-default, as the page's own hreflang does (`buildPageMetadata`). Listing
 * only the default locale left every zh-CN page out of the sitemap, and
 * hreflang that only the sitemap declared had no return tag on the page.
 */
function entries(
  path: string,
  options: {
    lastModified?: string | Date;
    changeFrequency?: ChangeFrequency;
    priority?: number;
    /** Locales the page has real content in; defaults to every supported locale. */
    locales?: readonly string[];
  } = {},
): MetadataRoute.Sitemap {
  const locales: readonly string[] = options.locales?.length ? options.locales : SUPPORTED_LOCALES;
  const languages = localeAlternates(path, locales);
  return locales.map((locale) => ({
    url: localeUrl(locale, path),
    lastModified: options.lastModified,
    changeFrequency: options.changeFrequency,
    priority: options.priority,
    alternates: { languages },
  }));
}

/** Active shop products. A pillow or bolster's page canonicalises to its configurator, listed above. */
async function getAllActiveProductSlugs(): Promise<{ slug: string; lastModified?: string }[]> {
  const collected: { slug: string; lastModified?: string }[] = [];
  let page = 1;
  for (let safety = 0; safety < 100; safety++) {
    const { products, total } = await getProducts({ status: "active", limit: 100, page });
    for (const product of products) {
      collected.push({ slug: product.slug, lastModified: product.updated_at });
    }
    if (collected.length >= total || products.length === 0) break;
    page++;
  }
  return collected;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    ...entries("", { changeFrequency: "daily", priority: 1 }),
    ...entries("/shop", { changeFrequency: "daily", priority: 0.9 }),
    ...entries("/blog", { changeFrequency: "weekly", priority: 0.7 }),
    ...entries("/mp-config", { changeFrequency: "weekly", priority: 0.85 }),
    ...entries("/mbolster-config", { changeFrequency: "weekly", priority: 0.85 }),
    ...entries("/guides/neck-pain", { changeFrequency: "monthly", priority: 0.8 }),
    ...entries("/guides/cervical-pillow", { changeFrequency: "monthly", priority: 0.8 }),
    ...entries("/guides/custom-pillow", { changeFrequency: "monthly", priority: 0.8 }),
    ...entries("/appointments?type=customisation", { changeFrequency: "monthly", priority: 0.6 }),
    ...entries("/our-partners", { changeFrequency: "monthly", priority: 0.3 }),
    ...entries("/faq", { changeFrequency: "monthly", priority: 0.3 }),
    ...Object.values(ENGLISH_ONLY_PAGE_META).flatMap(({ path }) =>
      entries(path, { changeFrequency: "monthly", priority: 0.3, locales: [DEFAULT_LOCALE] }),
    ),
  ];

  let productEntries: MetadataRoute.Sitemap = [];
  let blogEntries: MetadataRoute.Sitemap = [];

  try {
    const products = await getAllActiveProductSlugs();
    productEntries = products.flatMap((p) =>
      entries(`/shop/${p.slug}`, {
        lastModified: p.lastModified,
        changeFrequency: "weekly",
        priority: 0.8,
      }),
    );
  } catch (error) {
    console.error("sitemap: failed to load products", error);
  }

  try {
    const posts = await getBlogPostsFromDb({ status: "published" });
    blogEntries = posts.flatMap((post) =>
      entries(`/blog/${post.slug}`, {
        // Editorial edits only: the row's updated_at moves on every bulk sync (slice 17).
        lastModified: post.content_updated_at ?? post.published_at ?? undefined,
        changeFrequency: "monthly",
        priority: 0.6,
        locales: post.locales,
      }),
    );
  } catch (error) {
    console.error("sitemap: failed to load blog posts", error);
  }

  return [...staticEntries, ...productEntries, ...blogEntries];
}
