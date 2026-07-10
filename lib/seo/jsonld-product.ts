import type { Product, ProductVariant } from "@/lib/types/ecommerce";
import { localeUrl } from "@/lib/seo/locale-url";
import type { ReviewAggregate } from "@/lib/seo/review-aggregate";

export type ProductJsonLdInput = {
  product: Product;
  lang: string;
  slug: string;
  title: string;
  description: string;
  priceRange: { min: number; max: number; currency: string };
  reviews: ReviewAggregate;
  categoryName?: string;
};

function variantAvailability(variant: ProductVariant): string {
  const stock = variant.stock_available ?? 0;
  return stock > 0
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
}

export function buildProductJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  const { product, lang, slug, title, description, priceRange, reviews, categoryName } = input;
  const url = localeUrl(lang, `/shop/${slug}`);
  const imageUrl = product.images?.[0]?.url;
  const activeVariants = (product.variants ?? []).filter((v) => v.is_active);

  const offers =
    activeVariants.length === 1
      ? {
          "@type": "Offer",
          price: activeVariants[0].price,
          priceCurrency: activeVariants[0].currency ?? priceRange.currency,
          availability: variantAvailability(activeVariants[0]),
          sku: activeVariants[0].sku ?? activeVariants[0].id,
          url,
          seller: { "@type": "Organization", name: "Mpillow" },
        }
      : {
          "@type": "AggregateOffer",
          lowPrice: priceRange.min,
          highPrice: priceRange.max,
          priceCurrency: priceRange.currency,
          offerCount: activeVariants.length,
          availability:
            activeVariants.some((v) => (v.stock_available ?? 0) > 0)
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          seller: { "@type": "Organization", name: "Mpillow" },
        };

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": url,
    name: title,
    description,
    url,
    ...(imageUrl ? { image: imageUrl } : {}),
    ...(activeVariants[0]?.sku ? { sku: activeVariants[0].sku } : {}),
    brand: { "@type": "Brand", name: "Mpillow" },
    offers,
  };

  if (reviews.count >= 1) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Math.round(reviews.average * 10) / 10,
      reviewCount: reviews.count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return jsonLd;
}

export function buildProductBreadcrumbJsonLd(input: {
  lang: string;
  slug: string;
  title: string;
  categoryName?: string;
}): Record<string, unknown> {
  const home = localeUrl(input.lang, "");
  const shop = localeUrl(input.lang, "/shop");
  const product = localeUrl(input.lang, `/shop/${input.slug}`);

  const items: { "@type": string; position: number; name: string; item: string }[] = [
    { "@type": "ListItem", position: 1, name: "Home", item: home },
    { "@type": "ListItem", position: 2, name: "Shop", item: shop },
  ];

  if (input.categoryName) {
    items.push({
      "@type": "ListItem",
      position: 3,
      name: input.categoryName,
      item: shop,
    });
    items.push({ "@type": "ListItem", position: 4, name: input.title, item: product });
  } else {
    items.push({ "@type": "ListItem", position: 3, name: input.title, item: product });
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

/** Product JSON-LD for configurator SEO shells (composed sellable; price range, not per-variant list). */
export function buildConfiguratorProductJsonLd(input: {
  lang: string;
  path: string;
  name: string;
  description: string;
  image?: string;
  lowPrice?: number;
  highPrice?: number;
  currency?: string;
}): Record<string, unknown> {
  const url = localeUrl(input.lang, input.path);
  const currency = input.currency ?? "SGD";
  const low = input.lowPrice;
  const high = input.highPrice ?? input.lowPrice;

  let offers: Record<string, unknown> | undefined;
  if (low != null && high != null) {
    offers =
      high > low
        ? {
            "@type": "AggregateOffer",
            lowPrice: low,
            highPrice: high,
            priceCurrency: currency,
            availability: "https://schema.org/InStock",
            url,
            seller: { "@type": "Organization", name: "Mpillow" },
          }
        : {
            "@type": "Offer",
            price: low,
            priceCurrency: currency,
            availability: "https://schema.org/InStock",
            url,
            seller: { "@type": "Organization", name: "Mpillow" },
          };
  }

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    url,
    brand: { "@type": "Brand", name: "Mpillow" },
    ...(input.image ? { image: input.image } : {}),
    ...(offers ? { offers } : {}),
  };
}
