import { getSiteOrigin } from "@/lib/site-url";
import { localeUrl } from "@/lib/seo/locale-url";

export type ArticleJsonLdInput = {
  lang: string;
  slug: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  publishedAt?: string | null;
  updatedAt?: string;
  author: string;
};

export function buildArticleJsonLd(input: ArticleJsonLdInput): Record<string, unknown> {
  const origin = getSiteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    image: input.imageUrl ? [input.imageUrl] : [],
    datePublished: input.publishedAt,
    dateModified: input.updatedAt,
    author: { "@type": "Person", name: input.author },
    publisher: {
      "@type": "Organization",
      name: "Mpillow",
      logo: { "@type": "ImageObject", url: `${origin}/mpillow_logo_2026.png` },
    },
    mainEntityOfPage: localeUrl(input.lang, `/blog/${input.slug}`),
  };
}

export function buildArticleBreadcrumbJsonLd(input: {
  lang: string;
  slug: string;
  title: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: localeUrl(input.lang, "") },
      { "@type": "ListItem", position: 2, name: "Blogs", item: localeUrl(input.lang, "/blog") },
      {
        "@type": "ListItem",
        position: 3,
        name: input.title,
        item: localeUrl(input.lang, `/blog/${input.slug}`),
      },
    ],
  };
}

export function buildFaqPageJsonLd(
  items: { question: string; answer: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
