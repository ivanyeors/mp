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

/**
 * The share image when a page has none of its own: the logo on white, 1200×630.
 * Without it, link previews (WhatsApp, Telegram) fall back to the favicon.
 */
export const DEFAULT_OG_IMAGE = "/og-image.png";

export function buildPageMetadata(input: PageMetadataInput): Metadata {
  const url = localeUrl(input.lang, input.path);
  const imageUrl = input.image ?? DEFAULT_OG_IMAGE;

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
      languages: localeAlternates(input.path, input.alternateLocales),
    },
  };
}
