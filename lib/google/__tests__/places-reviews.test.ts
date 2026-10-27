import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MIN_REVIEW_RATING,
  PLACE_REVIEWS_REVALIDATE_SECONDS,
  getGooglePlaceTestimonials,
  isTestimonialVisible,
} from "@/lib/google/places-reviews";

function placeResponse(ratings: number[]) {
  return {
    googleMapsUri: "https://maps.google.com/?cid=1",
    reviews: ratings.map((rating, i) => ({
      rating,
      publishTime: `2026-01-0${i + 1}T00:00:00Z`,
      relativePublishTimeDescription: `${i + 1} months ago`,
      text: { text: `Review ${i + 1} (${rating} stars)` },
      authorAttribution: { displayName: `Reviewer ${i + 1}` },
    })),
  };
}

describe("isTestimonialVisible", () => {
  it("hides ratings below the threshold and unrated reviews", () => {
    expect(isTestimonialVisible(5, 4)).toBe(true);
    expect(isTestimonialVisible(4, 4)).toBe(true);
    expect(isTestimonialVisible(3, 4)).toBe(false);
    expect(isTestimonialVisible(1, 4)).toBe(false);
    expect(isTestimonialVisible(undefined, 4)).toBe(false);
    expect(isTestimonialVisible(1, 1)).toBe(true);
  });
});

describe("getGooglePlaceTestimonials", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    process.env.GOOGLE_PLACE_ID = "test-place";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  function stubFetch(ratings: number[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => placeResponse(ratings) })),
    );
  }

  it("hides reviews rated 3 stars and below by default", async () => {
    expect(DEFAULT_MIN_REVIEW_RATING).toBe(4);
    stubFetch([5, 1, 4, 3, 2, 5]);

    const result = await getGooglePlaceTestimonials({ limit: 20 });

    expect(result.map((t) => t.rating)).toEqual([5, 4, 5]);
    expect(result.every((t) => (t.rating ?? 0) >= 4)).toBe(true);
  });

  it("applies the limit after filtering so hidden reviews do not consume slots", async () => {
    stubFetch([1, 2, 5, 3, 4]);

    const result = await getGooglePlaceTestimonials({ limit: 2 });

    expect(result.map((t) => t.rating)).toEqual([5, 4]);
  });

  it("caches the billed read for a week and asks only for the fields it reads", async () => {
    stubFetch([5]);

    await getGooglePlaceTestimonials({ limit: 20 });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit & { next?: { revalidate?: number } }];
    expect(init.next?.revalidate).toBe(PLACE_REVIEWS_REVALIDATE_SECONDS);
    expect(PLACE_REVIEWS_REVALIDATE_SECONDS).toBe(7 * 24 * 60 * 60);
    expect((init.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("reviews,googleMapsUri");
  });

  it("shows every review when minRating is 1", async () => {
    stubFetch([1, 3, 5]);

    const result = await getGooglePlaceTestimonials({ limit: 20, minRating: 1 });

    expect(result.map((t) => t.rating)).toEqual([1, 3, 5]);
  });
});
