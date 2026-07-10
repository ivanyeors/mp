import { getProducts } from "@/lib/ecommerce/products";
import { buildLlmsIndex } from "@/lib/seo/llms-index";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

export async function GET() {
  let products: { slug: string; title: string }[] = [];
  try {
    const { products: rows } = await getProducts({ status: "active", limit: 50, page: 1 });
    products = rows.map((p) => ({
      slug: p.slug,
      title: p.content?.[DEFAULT_LOCALE]?.title ?? p.slug,
    }));
  } catch {
    // ponytail: llms.txt still useful without product list
  }

  const content = buildLlmsIndex(products);

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=43200",
    },
  });
}
