import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

const { checkBusinessProfileSetup } = await import("@/lib/reviews/status");

type Route = { status?: number; body: unknown };

function google(routes: Record<string, Route>) {
  return vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    const key = Object.keys(routes).find((k) => href.includes(k));
    if (!key) throw new Error(`unexpected fetch ${href}`);
    const { status = 200, body } = routes[key];
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

const accessToken = async () => "token";
const LOCATION = "accounts/111/locations/222";

beforeEach(() => {
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret");
  vi.stubEnv("GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN", "refresh");
  vi.stubEnv("GOOGLE_BUSINESS_LOCATION", "");
  vi.stubEnv("GOOGLE_REVIEWS_PUSH_TOKEN", "push");
});

describe("checkBusinessProfileSetup", () => {
  it("has nothing to check without OAuth credentials", async () => {
    vi.stubEnv("GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN", "");
    expect(await checkBusinessProfileSetup({ accessToken })).toBeNull();
  });

  it("says the refresh token was refused, and how to replace it", async () => {
    const setup = await checkBusinessProfileSetup({
      accessToken: async () => {
        throw new Error("invalid_grant");
      },
    });
    expect(setup).toEqual({
      ok: false,
      error: expect.stringMatching(/^Google refused GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN \(invalid_grant\)\. Issue a new one/),
    });
  });

  it("reads a zero quota as API access not approved yet", async () => {
    const fetch = google({
      "/accounts": {
        status: 429,
        body: { error: { message: "Quota exceeded for quota metric 'Requests' and limit 'Requests per minute' of service 'mybusinessaccountmanagement.googleapis.com'" } },
      },
    });
    const setup = await checkBusinessProfileSetup({ accessToken, fetch });
    expect(setup).toMatchObject({ ok: false, error: expect.stringMatching(/isn't approved for this Cloud project yet/) });
  });

  it("lists the locations to choose from while GOOGLE_BUSINESS_LOCATION is unset", async () => {
    const fetch = google({
      "/accounts/111/locations?": { body: { locations: [{ name: "locations/222", title: "Mpillow" }] } },
      "/accounts": { body: { accounts: [{ name: "accounts/111" }] } },
    });
    const setup = await checkBusinessProfileSetup({ accessToken, fetch });
    expect(setup).toEqual({
      ok: true,
      location: null,
      reviews: null,
      locations: [{ name: LOCATION, title: "Mpillow" }],
      pubsubTopic: null,
      problems: [],
    });
  });

  it("flags a malformed location and still offers the right one", async () => {
    vi.stubEnv("GOOGLE_BUSINESS_LOCATION", "locations/222");
    const fetch = google({
      "/accounts/111/locations?": { body: { locations: [{ name: "locations/222", title: "Mpillow" }] } },
      "/accounts": { body: { accounts: [{ name: "accounts/111" }] } },
    });
    const setup = await checkBusinessProfileSetup({ accessToken, fetch });
    expect(setup).toMatchObject({ ok: true, location: null, locations: [{ name: LOCATION }] });
    expect(setup?.ok && setup.problems[0]).toMatch(/must look like accounts\/123\/locations\/456/);
  });

  it("is connected when the location's reviews read and Google publishes to Pub/Sub", async () => {
    vi.stubEnv("GOOGLE_BUSINESS_LOCATION", LOCATION);
    const fetch = google({
      [`/v4/${LOCATION}/reviews`]: { body: { totalReviewCount: 87, averageRating: 4.9 } },
      "/accounts/111/notificationSetting": {
        body: { pubsubTopic: "projects/p/topics/gbp-reviews", notificationTypes: ["NEW_REVIEW", "UPDATED_REVIEW"] },
      },
    });
    expect(await checkBusinessProfileSetup({ accessToken, fetch })).toEqual({
      ok: true,
      location: LOCATION,
      reviews: { total: 87, average: 4.9 },
      locations: [],
      pubsubTopic: "projects/p/topics/gbp-reviews",
      problems: [],
    });
  });

  it("names what keeps reviews from arriving in real time", async () => {
    vi.stubEnv("GOOGLE_BUSINESS_LOCATION", LOCATION);
    vi.stubEnv("GOOGLE_REVIEWS_PUSH_TOKEN", "");
    const fetch = google({
      [`/v4/${LOCATION}/reviews`]: { body: { totalReviewCount: 87 } },
      "/accounts/111/notificationSetting": { body: { name: "accounts/111/notificationSetting" } },
    });
    const setup = await checkBusinessProfileSetup({ accessToken, fetch });
    expect(setup?.ok && setup.problems).toEqual([
      expect.stringMatching(/^Google doesn't publish new reviews to Pub\/Sub yet/),
      expect.stringMatching(/^GOOGLE_REVIEWS_PUSH_TOKEN isn't set/),
    ]);
  });
});
