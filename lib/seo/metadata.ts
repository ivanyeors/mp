import type { Metadata } from "next";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { localeAlternates, localeUrl, primaryLocale } from "@/lib/seo/locale-url";

export type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  lang: string;
  image?: string | null;
  keywords?: string[];
  type?: "website" | "article";
  noindex?: boolean;
  alternateLocales?: readonly string[];
  copyOf?: string;
};

export const DEFAULT_OG_IMAGE = "/og-image.png";

export function buildPageMetadata(input: PageMetadataInput): Metadata {
  const locales: readonly string[] = input.alternateLocales ?? SUPPORTED_LOCALES;
  const translated = locales.includes(input.lang);
  const url = localeUrl(translated ? input.lang : (primaryLocale(locales) ?? input.lang), input.copyOf ?? input.path);
  const imageUrl = input.image ?? DEFAULT_OG_IMAGE;

  return {
    title: input.title,
    description: input.description,
    ...(input.keywords?.length ? { keywords: input.keywords } : {}),
    ...(input.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      type: input.type ?? "website",
      siteName: "Mpillow",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: input.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [imageUrl],
    },
    alternates: {
      canonical: url,
      ...(translated && input.copyOf === undefined ? { languages: localeAlternates(input.path, locales) } : {}),
    },
  };
}
