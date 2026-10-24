import { getSiteOrigin } from "@/lib/site-url";
import { localeUrl } from "@/lib/seo/locale-url";
import { organizationId } from "@/lib/seo/jsonld-organization";

export type ArticleJsonLdInput = {
  lang: string;
  slug: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  publishedAt?: string | null;
  /** Editorial update time; falls back to publishedAt. Never the row's updated_at. */
  contentUpdatedAt?: string | null;
  author: string;
};

/** Brand bylines ("Mpillow", "TheMpillow SG") are the organisation, not a person. */
export function isBrandAuthor(author: string | null | undefined): boolean {
  return !author?.trim() || /mpillow/i.test(author);
}

export function buildAuthorJsonLd(author: string | null | undefined): Record<string, unknown> {
  const origin = getSiteOrigin();
  const org = { "@type": "Organization", name: "Mpillow", url: origin };
  return isBrandAuthor(author) ? org : { "@type": "Person", name: author!.trim(), worksFor: org };
}

export function buildArticleJsonLd(input: ArticleJsonLdInput): Record<string, unknown> {
  const origin = getSiteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    image: input.imageUrl ? [input.imageUrl] : [],
    datePublished: input.publishedAt,
    dateModified: input.contentUpdatedAt ?? input.publishedAt,
    author: buildAuthorJsonLd(input.author),
    publisher: {
      "@type": "Organization",
      "@id": organizationId(),
      name: "Mpillow",
      url: origin,
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
