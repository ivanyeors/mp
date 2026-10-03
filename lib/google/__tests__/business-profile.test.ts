import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BusinessProfileError,
  createBusinessProfileClient,
  getBusinessProfileConfig,
  isLocationName,
  isReviewName,
  starRatingToNumber,
} from "@/lib/google/business-profile";

const LOCATION = "accounts/123/locations/456";
const REVIEW = `${LOCATION}/reviews/AbC-9_x`;

function fakeFetch(status: number, body: unknown) {
  return vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(
    async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

afterEach(() => vi.unstubAllEnvs());

describe("Business Profile names", () => {
  it("accepts only well-formed location and review names", () => {
    expect(isLocationName(LOCATION)).toBe(true);
    expect(isReviewName(REVIEW)).toBe(true);
    expect(isLocationName("locations/456")).toBe(false);
    expect(isReviewName(`${LOCATION}/reviews/x?alt=media`)).toBe(false);
    expect(isReviewName(`${LOCATION}/reviews/../../x`)).toBe(false);
  });

  it("maps Google's star enum", () => {
    expect(starRatingToNumber("FIVE")).toBe(5);
    expect(starRatingToNumber("ONE")).toBe(1);
    expect(starRatingToNumber("STAR_RATING_UNSPECIFIED")).toBeNull();
    expect(starRatingToNumber(undefined)).toBeNull();
  });
});

describe("Business Profile client", () => {
  it("lists reviews for the location with a bearer token", async () => {
    const fetchImpl = fakeFetch(200, {
      reviews: [{ name: REVIEW, starRating: "FOUR", comment: "Nice" }],
      nextPageToken: "n2",
      totalReviewCount: 40,
    });
    const client = createBusinessProfileClient({ getAccessToken: async () => "tok", fetchImpl });
    const page = await client.listReviews(LOCATION, { pageSize: 500 });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`https://mybusiness.googleapis.com/v4/${LOCATION}/reviews?pageSize=50`);
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(page).toMatchObject({ nextPageToken: "n2", totalReviewCount: 40 });
    expect(page.reviews[0].comment).toBe("Nice");
  });

  it("PUTs the reply comment to the review's /reply", async () => {
    const fetchImpl = fakeFetch(200, { comment: "Thanks!", updateTime: "2026-10-02T01:00:00Z" });
    const client = createBusinessProfileClient({ getAccessToken: async () => "tok", fetchImpl });
    const reply = await client.updateReply(REVIEW, "Thanks!");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`https://mybusiness.googleapis.com/v4/${REVIEW}/reply`);
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ comment: "Thanks!" });
    expect(reply).toEqual({ comment: "Thanks!", updateTime: "2026-10-02T01:00:00Z" });
  });

  it("surfaces Google's error message (e.g. the 0-quota state before approval)", async () => {
    const fetchImpl = fakeFetch(429, { error: { message: "Quota exceeded for quota metric 'Requests'" } });
    const client = createBusinessProfileClient({ getAccessToken: async () => "tok", fetchImpl });
    const err = await client.listReviews(LOCATION).catch((e) => e);
    expect(err).toBeInstanceOf(BusinessProfileError);
    expect(err.status).toBe(429);
    expect(err.message).toContain("Quota exceeded");
  });

  it("refuses a malformed name before any request", async () => {
    const fetchImpl = fakeFetch(200, {});
    const client = createBusinessProfileClient({ getAccessToken: async () => "tok", fetchImpl });
    await expect(client.updateReply("accounts/1/locations/2", "x")).rejects.toThrow(/Not a review name/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("getBusinessProfileConfig", () => {
  it("is null until every variable is set, and validates the location", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
    vi.stubEnv("GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN", "");
    vi.stubEnv("GOOGLE_BUSINESS_LOCATION", LOCATION);
    expect(getBusinessProfileConfig()).toBeNull();

    vi.stubEnv("GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN", "rt");
    expect(getBusinessProfileConfig()).toMatchObject({ location: LOCATION, refreshToken: "rt" });

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("GOOGLE_BUSINESS_LOCATION", "locations/456");
    expect(getBusinessProfileConfig()).toBeNull();
  });
});
