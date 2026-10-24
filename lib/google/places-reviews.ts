export type GooglePlaceTestimonial = {
  quote: string;
  name: string;
  title: string;
  avatarSrc?: string;
  avatarAlt?: string;
  rating?: number;
  sourceUrl?: string;
  publishedAt?: string;
};

type PlacesV1Review = {
  rating?: number;
  publishTime?: string;
  relativePublishTimeDescription?: string;
  text?: { text?: string };
  originalText?: { text?: string };
  authorAttribution?: {
    displayName?: string;
    uri?: string;
    photoUri?: string;
  };
};

type PlacesV1PlaceDetails = {
  reviews?: PlacesV1Review[];
  googleMapsUri?: string;
};

function getRequiredEnv(name: string): string | null {
  const v = process.env[name];
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

function getOptionalReferrerHeaders(): Record<string, string> {
  // If the API key is restricted to HTTP referrers, server-side requests will be rejected unless we
  // explicitly provide a Referer header that matches an allowed pattern for that key.
  // Prefer using a server-restricted key (IP restriction) in production.
  const ref = getRequiredEnv("GOOGLE_MAPS_API_REFERRER");
  if (!ref) return {};

  const headers: Record<string, string> = { Referer: ref };
  try {
    headers.Origin = new URL(ref).origin;
  } catch {
    // If ref isn't a valid URL, just omit Origin.
  }
  return headers;
}

export function hasGooglePlaceReviewsConfig(): boolean {
  return Boolean(getRequiredEnv("GOOGLE_MAPS_API_KEY") && getRequiredEnv("GOOGLE_PLACE_ID"));
}

/**
 * Reviews rated below this (1..5) are hidden from the storefront by default.
 * Google's Places API returns its own "most relevant" pick of at most 5 reviews,
 * so this is a display filter only — it cannot change what Google shows on Maps.
 */
export const DEFAULT_MIN_REVIEW_RATING = 4;

export function isTestimonialVisible(rating: number | undefined, minRating: number): boolean {
  return typeof rating === "number" && rating >= minRating;
}

/**
 * How long one Places read is reused. Asking for `reviews` bills every uncached read as
 * Place Details Enterprise + Atmosphere (past 1,000 free a month), and Google's top five
 * barely move in a day. Every caller shares this one cached response — unless it calls from
 * inside `unstable_cache`, where Next runs the fetch as no-store and every read is billed.
 */
export const PLACE_REVIEWS_REVALIDATE_SECONDS = 24 * 60 * 60;

export async function getGooglePlaceTestimonials(opts?: {
  limit?: number;
  languageCode?: string;
  /** Hide reviews rated below this value. Defaults to DEFAULT_MIN_REVIEW_RATING; pass 1 to show all. */
  minRating?: number;
}): Promise<GooglePlaceTestimonial[]> {
  const apiKey = getRequiredEnv("GOOGLE_MAPS_API_KEY");
  const placeId = getRequiredEnv("GOOGLE_PLACE_ID");
  if (!apiKey || !placeId) return [];

  const limit = Math.max(1, Math.min(20, opts?.limit ?? 6));
  const minRating = Math.max(1, Math.min(5, opts?.minRating ?? DEFAULT_MIN_REVIEW_RATING));
  const languageCode = (opts?.languageCode ?? process.env.GOOGLE_PLACE_REVIEWS_LANGUAGE ?? "en").trim();

  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  if (languageCode) url.searchParams.set("languageCode", languageCode);
  // ponytail: no reviews_sort param — API returns most-relevant order; client sorts by rating, keeping index as tiebreaker.

  const res = await fetch(url.toString(), {
    headers: {
      "X-Goog-Api-Key": apiKey,
      // Request only what we read (required by Places API v1). `reviews` alone sets the SKU.
      "X-Goog-FieldMask": "reviews,googleMapsUri",
      ...getOptionalReferrerHeaders(),
    },
    next: { revalidate: PLACE_REVIEWS_REVALIDATE_SECONDS },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as PlacesV1PlaceDetails;
  const sourceUrl = typeof data.googleMapsUri === "string" ? data.googleMapsUri : undefined;

  return (data.reviews ?? [])
    .filter((r) => isTestimonialVisible(r.rating, minRating))
    .slice(0, limit)
    .map((r): GooglePlaceTestimonial => {
    const quote =
      r.text?.text?.trim() ||
      r.originalText?.text?.trim() ||
      "Great experience.";

    const name = r.authorAttribution?.displayName?.trim() || "Google customer";
    const avatarSrc = r.authorAttribution?.photoUri;
    const avatarAlt = name;

    const rel = r.relativePublishTimeDescription?.trim();
    const title = rel ? `Google review · ${rel}` : "Google review";

    return {
      quote,
      name,
      title,
      avatarSrc,
      avatarAlt,
      rating: typeof r.rating === "number" ? r.rating : undefined,
      sourceUrl: r.authorAttribution?.uri || sourceUrl,
      publishedAt: typeof r.publishTime === "string" ? r.publishTime : undefined,
    };
  });
}

