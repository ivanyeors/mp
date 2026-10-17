import type { Metadata } from "next";
import { localeAlternates, localeUrl } from "@/lib/seo/locale-url";

export type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  lang: string;
  image?: string | null;
  keywords?: string[];
  type?: "website" | "article";
  noindex?: boolean;
  /** Locales the page really exists in; defaults to every supported locale. */
  alternateLocales?: readonly string[];
};

export function buildPageMetadata(input: PageMetadataInput): Metadata {
  const url = localeUrl(input.lang, input.path);
  const imageUrl = input.image ?? undefined;

  return {
    title: input.title,
    description: input.description,
    ...(input.keywords?.length ? { keywords: input.keywords } : {}),
    ...(input.noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      type: input.type ?? "website",
      siteName: "Mpillow",
      ...(imageUrl ? { images: [{ url: imageUrl, width: 1200, height: 630, alt: input.title }] } : {}),
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title: input.title,
      description: input.description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
    alternates: {
      canonical: url,
      languages: localeAlternates(input.path, input.alternateLocales),
    },
  };
}
