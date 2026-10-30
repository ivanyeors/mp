import type { Metadata } from "next";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { localeAlternates, localeUrl, primaryLocale } from "@/lib/seo/locale-url";

export type PageMetadataInput = {
  title: string;
  description: string;
  /** Path after the locale. A query string belongs only when it names a different page (`/appointments?type=…`). */
  path: string;
  /** The locale in the URL. */
  lang: string;
  image?: string | null;
  keywords?: string[];
  type?: "website" | "article";
  /** Kept out of search, while its links are still followed. */
  noindex?: boolean;
  /**
   * Locales the page really exists in; defaults to every supported locale. In
   * any other locale the page shows another locale's text, so it is a copy: it
   * canonicalises to that locale and declares no hreflang, since none of the
   * alternates would name it back.
   */
  alternateLocales?: readonly string[];
  /**
   * The page this one is a copy of: a filtered view (`/blog?label=…` copies
   * `/blog`), or a product ordered through its configurator. It canonicalises
   * there and declares no hreflang.
   */
  copyOf?: string;
};

/**
 * The share image when a page has none of its own: the logo on white, 1200×630.
 * Without it, link previews (WhatsApp, Telegram) fall back to the favicon.
 */
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
    // `follow` so a private page's links still count (a nofollow page makes every link on it nofollow).
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
