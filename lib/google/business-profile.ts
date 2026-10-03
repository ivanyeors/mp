import { OAuth2Client } from "google-auth-library";

/**
 * Google Business Profile reviews: list, read, and reply.
 *
 * Reviews live on the legacy v4 API (mybusiness.googleapis.com/v4), which
 * Google only serves to projects approved through the Business Profile API
 * access form — until then every call fails with a 0-quota error. Places API
 * (lib/google/places-reviews.ts) is a different, read-only surface that only
 * returns Google's top five reviews and cannot reply.
 *
 * Auth is an OAuth refresh token for the Google account that manages the
 * Business Profile (sg@mpillow.com), scope `business.manage`, on the same
 * OAuth client as Calendar and Drive. One refresh token per job, as with
 * GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN — this one is GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN.
 */

const V4 = "https://mybusiness.googleapis.com/v4";

export const BUSINESS_MANAGE_SCOPE = "https://www.googleapis.com/auth/business.manage";

export type GbpStarRating = "STAR_RATING_UNSPECIFIED" | "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";

export type GbpReview = {
  /** accounts/{a}/locations/{l}/reviews/{r} */
  name: string;
  reviewId?: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  starRating?: GbpStarRating;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
};

export type GbpReviewPage = {
  reviews: GbpReview[];
  nextPageToken: string | null;
  averageRating: number | null;
  totalReviewCount: number | null;
};

export class BusinessProfileError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BusinessProfileError";
  }
}

const STAR_VALUES: Record<GbpStarRating, number | null> = {
  STAR_RATING_UNSPECIFIED: null,
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export function starRatingToNumber(rating: string | undefined | null): number | null {
  return rating && rating in STAR_VALUES ? STAR_VALUES[rating as GbpStarRating] : null;
}

/**
 * accounts/{a}/locations/{l} — the form the v4 reviews endpoints take. Ids are
 * restricted to URL-safe characters because the name is spliced into the path.
 */
const ID = "[A-Za-z0-9_-]+";
const LOCATION_NAME = new RegExp(`^accounts/${ID}/locations/${ID}$`);
const REVIEW_NAME = new RegExp(`^accounts/${ID}/locations/${ID}/reviews/${ID}$`);

export function isLocationName(value: string): boolean {
  return LOCATION_NAME.test(value);
}

export function isReviewName(value: string): boolean {
  return REVIEW_NAME.test(value);
}

export type BusinessProfileConfig = {
  location: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

function env(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

/** Null until every piece is set — the sync treats that as "not configured". */
export function getBusinessProfileConfig(): BusinessProfileConfig | null {
  const location = env("GOOGLE_BUSINESS_LOCATION");
  const clientId = env("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = env("GOOGLE_OAUTH_CLIENT_SECRET");
  const refreshToken = env("GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN");
  if (!location || !clientId || !clientSecret || !refreshToken) return null;
  if (!isLocationName(location)) {
    console.error(
      "[google-business] GOOGLE_BUSINESS_LOCATION must look like accounts/{accountId}/locations/{locationId}",
    );
    return null;
  }
  return { location, clientId, clientSecret, refreshToken };
}

export type BusinessProfileClient = {
  listReviews(location: string, opts?: { pageSize?: number; pageToken?: string }): Promise<GbpReviewPage>;
  getReview(reviewName: string): Promise<GbpReview>;
  updateReply(reviewName: string, comment: string): Promise<{ comment: string; updateTime: string | null }>;
};

function errorMessage(status: number, body: string): string {
  try {
    const json = JSON.parse(body) as { error?: { message?: string; status?: string } };
    if (json.error?.message) return json.error.message;
  } catch {
    /* keep raw */
  }
  return body.slice(0, 300) || `HTTP ${status}`;
}

export function createBusinessProfileClient(deps: {
  getAccessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
}): BusinessProfileClient {
  const fetchImpl = deps.fetchImpl ?? fetch;

  async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const token = await deps.getAccessToken();
    const res = await fetchImpl(`${V4}/${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new BusinessProfileError(res.status, `Google Business Profile ${res.status}: ${errorMessage(res.status, text)}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    async listReviews(location, opts) {
      if (!isLocationName(location)) throw new BusinessProfileError(400, `Not a location name: ${location}`);
      const params = new URLSearchParams({ pageSize: String(Math.min(50, Math.max(1, opts?.pageSize ?? 50))) });
      if (opts?.pageToken) params.set("pageToken", opts.pageToken);
      const json = await call<{
        reviews?: GbpReview[];
        nextPageToken?: string;
        averageRating?: number;
        totalReviewCount?: number;
      }>(`${location}/reviews?${params}`);
      return {
        reviews: json.reviews ?? [],
        nextPageToken: json.nextPageToken ?? null,
        averageRating: json.averageRating ?? null,
        totalReviewCount: json.totalReviewCount ?? null,
      };
    },

    async getReview(reviewName) {
      if (!isReviewName(reviewName)) throw new BusinessProfileError(400, `Not a review name: ${reviewName}`);
      return call<GbpReview>(reviewName);
    },

    async updateReply(reviewName, comment) {
      if (!isReviewName(reviewName)) throw new BusinessProfileError(400, `Not a review name: ${reviewName}`);
      const json = await call<{ comment?: string; updateTime?: string }>(`${reviewName}/reply`, {
        method: "PUT",
        body: { comment },
      });
      return { comment: json.comment ?? comment, updateTime: json.updateTime ?? null };
    },
  };
}

export function businessProfileClientFromConfig(config: BusinessProfileConfig): BusinessProfileClient {
  const oauth = new OAuth2Client(config.clientId, config.clientSecret);
  oauth.setCredentials({ refresh_token: config.refreshToken });
  return createBusinessProfileClient({
    async getAccessToken() {
      const { token } = await oauth.getAccessToken();
      if (!token) throw new BusinessProfileError(401, "Google Business Profile: refresh token returned no access token");
      return token;
    },
  });
}
