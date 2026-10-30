import type { Metadata } from "next";
import {
  getProductBySlug,
  resolveProductContent,
  getProductPriceRange,
} from "@/lib/ecommerce/products";
import {
  buildPageMetadata,
  buildProductJsonLd,
  buildProductBreadcrumbJsonLd,
  buildFaqPageJsonLd,
  getReviewAggregate,
} from "@/lib/seo";
import { getPageFaq, productSurfaceKey, stripMarkdownForSchema } from "@/lib/page-faq";
import { JsonLdScript } from "@/components/seo/json-ld-script";
import { productMetaDescription } from "@/lib/seo/page-meta";
import { configuratorPath } from "@/lib/ecommerce/configurator-path";
import type { Locale } from "@/lib/i18n/locales";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";

interface Props {
  params: Promise<{ lang: string; slug: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  const product = await getProductBySlug(slug);

  // Same gate as page.tsx: a draft or archived slug 404s, so it must not leak metadata either.
  // `alternates: null`, or it inherits the shop's canonical and hreflang.
  if (!product || product.status !== "active") {
    return { title: "Product Not Found", alternates: null };
  }

  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const content = resolveProductContent(product, locale);
  const imageUrl = product.images?.[0]?.url;

  // The shop layout's own title ends the root template, so the brand is added here.
  const name = content.seo_title || content.title || product.slug;
  const title = name.includes("Mpillow") ? name : `${name} | Mpillow Singapore`;

  return buildPageMetadata({
    title,
    description: productMetaDescription(content, locale),
    path: `/shop/${slug}`,
    lang: locale,
    image: imageUrl,
    keywords: content.seo_keywords ?? [],
    type: "website",
    // A pillow or bolster is ordered in its configurator, the one page that should rank for it.
    copyOf: configuratorPath(product.product_type) ?? undefined,
  });
}

export default async function ProductLayout({ params, children }: Props) {
  const { lang, slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product || product.status !== "active") {
    return <>{children}</>;
  }

  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const content = resolveProductContent(product, locale);
  const priceRange = getProductPriceRange(product.variants ?? []);
  const reviews = await getReviewAggregate(product.id);

  const categoryName = product.category
    ? product.category.content?.[locale]?.name ??
      product.category.content?.[DEFAULT_LOCALE]?.name
    : undefined;

  const title = content.title || product.slug;
  const description = content.description ?? "";

  const productJsonLd = buildProductJsonLd({
    product,
    lang: locale,
    slug,
    title,
    description,
    priceRange,
    reviews,
    categoryName,
  });

  const breadcrumbJsonLd = buildProductBreadcrumbJsonLd({
    lang: locale,
    slug,
    title,
    categoryName,
  });

  // ponytail: FAQPage must live in layout with Product JSON-LD — page-level scripts stream into RSC flight only
  const pageFaqSet = await getPageFaq(productSurfaceKey(product.id), locale);
  const faqJsonLd =
    pageFaqSet && pageFaqSet.items.length > 0
      ? buildFaqPageJsonLd(
          pageFaqSet.items.map((item) => ({
            question: item.question,
            answer: stripMarkdownForSchema(item.answer),
          }))
        )
      : null;

  return (
    <>
      <JsonLdScript data={productJsonLd} />
      <JsonLdScript data={breadcrumbJsonLd} />
      {faqJsonLd ? <JsonLdScript data={faqJsonLd} /> : null}
      {children}
    </>
  );
}
