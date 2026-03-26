import type { Metadata } from "next";
import { getProductBySlug, resolveProductContent, getProductPriceRange } from "@/lib/ecommerce/products";

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

  const content = resolveProductContent(product, lang as "en-US" | "zh-CN");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mpillow.com";
  const productUrl = `${siteUrl}/${lang}/shop/${slug}`;
  const imageUrl = product.images?.[0]?.url;

  const title = content.seo_title || content.title || product.slug;
  const description =
    content.seo_description || content.description || `${content.title} - Custom pillow by Mpillow`;

  return {
    title,
    description,
    keywords: content.seo_keywords ?? [],
    openGraph: {
      title,
      description,
      url: productUrl,
      type: "website",
      ...(imageUrl ? { images: [{ url: imageUrl, width: 1200, height: 630, alt: content.title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
    alternates: {
      canonical: productUrl,
      languages: {
        "en-US": `${siteUrl}/en-US/shop/${slug}`,
        "zh-CN": `${siteUrl}/zh-CN/shop/${slug}`,
      },
    },
  };
}

export default async function ProductLayout({ params, children }: Props) {
  const { lang, slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return <>{children}</>;
  }

  const content = resolveProductContent(product, lang as "en-US" | "zh-CN");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mpillow.com";
  const priceRange = getProductPriceRange(product.variants ?? []);
  const imageUrl = product.images?.[0]?.url;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: content.title,
    description: content.description ?? "",
    url: `${siteUrl}/${lang}/shop/${slug}`,
    ...(imageUrl ? { image: imageUrl } : {}),
    brand: {
      "@type": "Brand",
      name: "Mpillow",
    },
    offers: {
      "@type": "AggregateOffer",
      lowPrice: priceRange.min,
      highPrice: priceRange.max,
      priceCurrency: priceRange.currency,
      availability: "https://schema.org/InStock",
      seller: {
        "@type": "Organization",
        name: "Mpillow",
      },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
