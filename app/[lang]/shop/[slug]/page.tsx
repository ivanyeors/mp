import { notFound } from "next/navigation";
import { PageFaqSectionView } from "@/components/page-faq/page-faq-section";
import { getProductBySlug, getProducts, resolveProductContent } from "@/lib/ecommerce/products";
import { getPageFaq, productSurfaceKey } from "@/lib/page-faq";
import { resolveAnswerLede } from "@/lib/seo/answer-lede";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { ProductDetailClient } from "./product-detail-client";
import type { Product } from "@/lib/types/ecommerce";

interface Props {
  params: Promise<{ lang: string; slug: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  const { lang, slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product || product.status !== "active") {
    notFound();
  }

  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const content = resolveProductContent(product, locale);
  const answerLede = resolveAnswerLede({
    seo_answer: content.seo_answer,
    seo_description: content.seo_description,
    description: content.description,
  });

  // Fetch related products from the same category
  let relatedProducts: Product[] = [];
  if (product.category_id) {
    const { products } = await getProducts({
      status: "active",
      category_id: product.category_id,
      limit: 5,
    });
    relatedProducts = products
      .filter((p) => p.id !== product.id)
      .slice(0, 4);
  }

  // Accordion in client slot; FAQPage JSON-LD emitted from layout (crawlable script tag)
  const pageFaqSet = await getPageFaq(productSurfaceKey(product.id), locale);

  return (
    <ProductDetailClient
      product={product}
      relatedProducts={relatedProducts}
      lang={lang}
      answerLede={answerLede}
      pageFaq={
        pageFaqSet && pageFaqSet.items.length > 0 ? (
          <PageFaqSectionView
            title={pageFaqSet.title}
            items={pageFaqSet.items}
            locale={locale}
            withJsonLd={false}
          />
        ) : null
      }
    />
  );
}
