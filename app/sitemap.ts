import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/ecommerce/products";
import { getBlogPostsFromDb } from "@/lib/blogs";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/i18n/locales";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mpillow.com";

// Re-generate at most once an hour; product/blog content changes are not urgent for the sitemap.
export const revalidate = 3600;

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

/**
 * Build a single sitemap entry for a locale-agnostic path (e.g. "/shop").
 * The canonical `url` uses the default locale, and every supported locale is
 * advertised via hreflang `alternates.languages` for international SEO.
 */
function entry(
  path: string,
  options: {
    lastModified?: string | Date;
    changeFrequency?: ChangeFrequency;
    priority?: number;
  } = {},
): MetadataRoute.Sitemap[number] {
  const languages: Record<string, string> = {};
  for (const locale of SUPPORTED_LOCALES) {
    languages[locale] = `${SITE_URL}/${locale}${path}`;
  }

  return {
    url: `${SITE_URL}/${DEFAULT_LOCALE}${path}`,
    lastModified: options.lastModified,
    changeFrequency: options.changeFrequency,
    priority: options.priority,
    alternates: { languages },
  };
}

/** Fetch every active product, paging past the per-request limit. */
async function getAllActiveProductSlugs(): Promise<{ slug: string; lastModified?: string }[]> {
  const collected: { slug: string; lastModified?: string }[] = [];
  let page = 1;
  // Hard cap to avoid an unbounded loop if `total` is ever inconsistent.
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
    entry("", { changeFrequency: "daily", priority: 1 }),
    entry("/shop", { changeFrequency: "daily", priority: 0.9 }),
    entry("/blog", { changeFrequency: "weekly", priority: 0.7 }),
    entry("/articles", { changeFrequency: "weekly", priority: 0.6 }),
    entry("/mbolster", { changeFrequency: "monthly", priority: 0.7 }),
    entry("/mp-maker", { changeFrequency: "monthly", priority: 0.7 }),
    entry("/mp-care", { changeFrequency: "monthly", priority: 0.5 }),
    entry("/support", { changeFrequency: "monthly", priority: 0.4 }),
  ];

  let productEntries: MetadataRoute.Sitemap = [];
  let blogEntries: MetadataRoute.Sitemap = [];

  // Dynamic data is best-effort: a DB hiccup at build/render time should still
  // produce a valid sitemap of the static marketing pages.
  try {
    const products = await getAllActiveProductSlugs();
    productEntries = products.map((p) =>
      entry(`/shop/${p.slug}`, {
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
    blogEntries = posts.map((post) =>
      entry(`/blog/${post.slug}`, {
        lastModified: post.updated_at ?? post.published_at ?? undefined,
        changeFrequency: "monthly",
        priority: 0.6,
      }),
    );
  } catch (error) {
    console.error("sitemap: failed to load blog posts", error);
  }

  return [...staticEntries, ...productEntries, ...blogEntries];
}
