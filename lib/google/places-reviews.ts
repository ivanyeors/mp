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

export async function getGooglePlaceTestimonials(opts?: {
  limit?: number;
  languageCode?: string;
  revalidateSeconds?: number;
}): Promise<GooglePlaceTestimonial[]> {
  const apiKey = getRequiredEnv("GOOGLE_MAPS_API_KEY");
  const placeId = getRequiredEnv("GOOGLE_PLACE_ID");
  if (!apiKey || !placeId) return [];

  const limit = Math.max(1, Math.min(20, opts?.limit ?? 6));
  const languageCode = (opts?.languageCode ?? process.env.GOOGLE_PLACE_REVIEWS_LANGUAGE ?? "en").trim();
  const revalidateSeconds = Math.max(60, Math.min(24 * 60 * 60, opts?.revalidateSeconds ?? 60 * 60));

  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  if (languageCode) url.searchParams.set("languageCode", languageCode);
  // ponytail: no reviews_sort param — API returns most-relevant order; client sorts by rating, keeping index as tiebreaker.

  const res = await fetch(url.toString(), {
    headers: {
      "X-Goog-Api-Key": apiKey,
      // Request only what we need (required by Places API v1).
      "X-Goog-FieldMask": "reviews,reviews.publishTime,rating,userRatingCount,googleMapsUri",
      ...getOptionalReferrerHeaders(),
    },
    next: { revalidate: revalidateSeconds },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as PlacesV1PlaceDetails;
  const sourceUrl = typeof data.googleMapsUri === "string" ? data.googleMapsUri : undefined;

  return (data.reviews ?? []).slice(0, limit).map((r): GooglePlaceTestimonial => {
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

