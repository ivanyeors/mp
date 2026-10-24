import { getProducts } from "@/lib/ecommerce/products";
import { getBlogPostsFromDb } from "@/lib/blogs";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { getSiteOrigin } from "@/lib/site-url";
import type { MetadataRoute } from "next";

// Re-generate at most once an hour; product/blog content changes are not urgent for the sitemap.
export const revalidate = 3600;

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

function entry(
  path: string,
  options: {
    lastModified?: string | Date;
    changeFrequency?: ChangeFrequency;
    priority?: number;
    /** Locales the page has real content in; defaults to every supported locale. */
    locales?: readonly string[];
  } = {},
): MetadataRoute.Sitemap[number] {
  const siteUrl = getSiteOrigin();
  const locales: readonly string[] = options.locales?.length ? options.locales : SUPPORTED_LOCALES;
  const languages: Record<string, string> = {};
  for (const locale of locales) {
    languages[locale] = `${siteUrl}/${locale}${path}`;
  }
  const primary = locales.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : locales[0];

  return {
    url: `${siteUrl}/${primary}${path}`,
    lastModified: options.lastModified,
    changeFrequency: options.changeFrequency,
    priority: options.priority,
    alternates: { languages },
  };
}

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
    entry("", { changeFrequency: "daily", priority: 1 }),
    entry("/shop", { changeFrequency: "daily", priority: 0.9 }),
    entry("/blog", { changeFrequency: "weekly", priority: 0.7 }),
    entry("/mp-config", { changeFrequency: "weekly", priority: 0.85 }),
    entry("/mbolster-config", { changeFrequency: "weekly", priority: 0.85 }),
    entry("/guides/neck-pain", { changeFrequency: "monthly", priority: 0.8 }),
    entry("/guides/cervical-pillow", { changeFrequency: "monthly", priority: 0.8 }),
    entry("/guides/custom-pillow", { changeFrequency: "monthly", priority: 0.8 }),
    entry("/mp-maker", { changeFrequency: "monthly", priority: 0.7 }),
    entry("/mp-care", { changeFrequency: "monthly", priority: 0.5 }),
    entry("/support", { changeFrequency: "monthly", priority: 0.4 }),
    entry("/our-partners", { changeFrequency: "monthly", priority: 0.3 }),
    entry("/privacy-policy", { changeFrequency: "monthly", priority: 0.3 }),
    entry("/shipping-refund-policies", { changeFrequency: "monthly", priority: 0.3 }),
    entry("/terms-of-service", { changeFrequency: "monthly", priority: 0.3 }),
    entry("/faq", { changeFrequency: "monthly", priority: 0.3 }),
  ];

  let productEntries: MetadataRoute.Sitemap = [];
  let blogEntries: MetadataRoute.Sitemap = [];

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
