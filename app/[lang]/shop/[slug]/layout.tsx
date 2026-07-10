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
import type { Locale } from "@/lib/i18n/locales";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";

interface Props {
  params: Promise<{ lang: string; slug: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return { title: "Product Not Found" };
  }

  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const content = resolveProductContent(product, locale);
  const imageUrl = product.images?.[0]?.url;

  const title = content.seo_title || content.title || product.slug;
  const description =
    content.seo_description || content.description || `${content.title} - Custom pillow by Mpillow`;

  return buildPageMetadata({
    title,
    description,
    path: `/shop/${slug}`,
    lang: locale,
    image: imageUrl,
    keywords: content.seo_keywords ?? [],
    type: "website",
  });
}

export default async function ProductLayout({ params, children }: Props) {
  const { lang, slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
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
