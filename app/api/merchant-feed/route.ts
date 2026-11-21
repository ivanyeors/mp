import { secretMatches } from "@/lib/auth/secret";
import { getProducts, resolveProductContent } from "@/lib/ecommerce/products";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { buildFeedItems, toTsv, type FeedProduct } from "@/lib/merchant/feed";
import { localeUrl } from "@/lib/seo/locale-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!secretMatches(process.env.MERCHANT_FEED_TOKEN?.trim(), token)) {
    return new Response("Not found", { status: 404 });
  }

  const products: FeedProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    const { products: batch, total } = await getProducts({ status: "active", shopCatalogOnly: false, limit: 100, page });
    for (const p of batch) {
      const content = resolveProductContent(p, DEFAULT_LOCALE);
      products.push({
        id: p.id,
        slug: p.slug,
        product_type: p.product_type,
        status: p.status,
        title: content.title,
        description: content.seo_description || content.description || content.title,
        images: p.images ?? [],
        variants: p.variants ?? [],
      });
    }
    if (page * 100 >= total) break;
  }

  const { items, skipped } = buildFeedItems(products, {
    productUrl: (slug) => localeUrl(DEFAULT_LOCALE, `/shop/${slug}`),
  });
  if (skipped.length) console.warn(`[merchant-feed] skipped ${skipped.length}:`, JSON.stringify(skipped.slice(0, 20)));

  return new Response(toTsv(items), {
    headers: {
      "Content-Type": "text/tab-separated-values; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Feed-Items": String(items.length),
    },
  });
}
