import { OAuth2Client } from "google-auth-library";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isLocationName } from "@/lib/google/business-profile";
import { getPlacesPollStatus, type PlacesPollStatus } from "@/lib/reviews/places-poll";

const ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const NOTIFY = "https://mybusinessnotifications.googleapis.com/v1";
const V4 = "https://mybusiness.googleapis.com/v4";

export const BUSINESS_PROFILE_ENV = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN",
  "GOOGLE_BUSINESS_LOCATION",
] as const;

export type BusinessProfileSetup =
  | { ok: false; error: string }
  | {
      ok: true;
      location: string | null;
      reviews: { total: number | null; average: number | null } | null;
      locations: { name: string; title: string | null }[];
      pubsubTopic: string | null;
      problems: string[];
    };

export type GoogleReviewsStatus = {
  businessProfile: {
    missing: string[];
    setup: BusinessProfileSetup | null;
  };
  places: PlacesPollStatus;
  stored: { total: number; waiting: number } | null;
};

type Json = Record<string, unknown>;

class GoogleCallError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function env(name: string): string | null {
  return process.env[name]?.trim() || null;
}

function clip(text: string, max = 300): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if ((error instanceof GoogleCallError && error.status === 429) || /quota/i.test(message)) {
    return `Google refused on quota, which means Business Profile API access isn't approved for this Cloud project yet (OPS checklist, step 1). Google said: ${clip(message)}`;
  }
  return clip(message);
}

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const oauth = new OAuth2Client(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  const { token } = await oauth.getAccessToken();
  if (!token) throw new Error("the refresh token returned no access token");
  return token;
}

export async function checkBusinessProfileSetup(
  deps: { fetch?: typeof fetch; accessToken?: () => Promise<string> } = {},
): Promise<BusinessProfileSetup | null> {
  const clientId = env("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = env("GOOGLE_OAUTH_CLIENT_SECRET");
  const refreshToken = env("GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) return null;

  let token: string;
  try {
    token = await (deps.accessToken ?? (() => refreshAccessToken(clientId, clientSecret, refreshToken)))();
  } catch (e) {
    return {
      ok: false,
      error: `Google refused GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN (${clip(e instanceof Error ? e.message : String(e))}). Issue a new one with the business.manage scope (OPS checklist, step 3).`,
    };
  }

  const fetchImpl = deps.fetch ?? fetch;
  const get = async (url: string): Promise<Json> => {
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text.slice(0, 300) || `HTTP ${res.status}`;
      try {
        message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
      } catch {}
      throw new GoogleCallError(res.status, `${res.status}: ${message}`);
    }
    return (text ? JSON.parse(text) : {}) as Json;
  };

  const raw = env("GOOGLE_BUSINESS_LOCATION");
  const location = raw && isLocationName(raw) ? raw : null;
  const problems: string[] = [];
  if (raw && !location) {
    problems.push(`GOOGLE_BUSINESS_LOCATION is "${clip(raw, 80)}", but it must look like accounts/123/locations/456.`);
  }

  let reviews: { total: number | null; average: number | null } | null = null;
  const locations: { name: string; title: string | null }[] = [];
  try {
    if (location) {
      const page = await get(`${V4}/${location}/reviews?pageSize=1`);
      reviews = {
        total: typeof page.totalReviewCount === "number" ? page.totalReviewCount : null,
        average: typeof page.averageRating === "number" ? page.averageRating : null,
      };
    } else {
      const accounts = ((await get(`${ACCOUNTS}/accounts`)).accounts ?? []) as { name?: string }[];
      for (const account of accounts.slice(0, 5)) {
        if (!account.name) continue;
        const page = await get(`${INFO}/${account.name}/locations?readMask=name,title&pageSize=100`);
        for (const l of (page.locations ?? []) as { name?: string; title?: string }[]) {
          const name = `${account.name}/${l.name ?? ""}`;
          if (isLocationName(name)) locations.push({ name, title: l.title?.trim() || null });
        }
      }
      if (!locations.length) {
        problems.push(
          "The refresh token's Google account manages no Business Profile location. Issue it signed in as an owner or manager of the profile (OPS checklist, step 3).",
        );
      }
    }
  } catch (e) {
    return { ok: false, error: explain(e) };
  }

  let pubsubTopic: string | null = null;
  if (location) {
    const account = location.split("/locations/")[0];
    try {
      const setting = await get(`${NOTIFY}/${account}/notificationSetting`);
      pubsubTopic = typeof setting.pubsubTopic === "string" && setting.pubsubTopic.trim() ? setting.pubsubTopic.trim() : null;
      const types = Array.isArray(setting.notificationTypes) ? (setting.notificationTypes as string[]) : [];
      const missingTypes = ["NEW_REVIEW", "UPDATED_REVIEW"].filter((t) => !types.includes(t));
      if (!pubsubTopic) {
        problems.push(
          "Google doesn't publish new reviews to Pub/Sub yet, so cards wait for the daily catch-up (up to 3 a day). Run scripts/google-business-setup.ts --notify with the topic (OPS checklist, step 6).",
        );
      } else if (missingTypes.length) {
        problems.push(
          `Google publishes to ${pubsubTopic}, but not ${missingTypes.join(" or ")}. Run scripts/google-business-setup.ts --notify ${pubsubTopic} again (OPS checklist, step 6).`,
        );
      }
    } catch (e) {
      problems.push(`Couldn't read where Google sends review notifications: ${explain(e)}`);
    }
    if (!env("GOOGLE_REVIEWS_PUSH_TOKEN")) {
      problems.push(
        "GOOGLE_REVIEWS_PUSH_TOKEN isn't set, so /api/webhooks/google-reviews refuses every notification and cards wait for the daily catch-up (OPS checklist, step 6).",
      );
    }
  }

  return { ok: true, location, reviews, locations, pubsubTopic, problems };
}

async function storedCounts(): Promise<{ total: number; waiting: number } | null> {
  const admin = supabaseAdmin();
  const [all, waiting] = await Promise.all([
    admin.from("google_reviews").select("id", { count: "exact", head: true }),
    admin.from("google_reviews").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  if (all.error || waiting.error) return null;
  return { total: all.count ?? 0, waiting: waiting.count ?? 0 };
}

export async function getGoogleReviewsStatus(): Promise<GoogleReviewsStatus> {
  const [setup, places, stored] = await Promise.all([
    checkBusinessProfileSetup().catch(
      (e): BusinessProfileSetup => ({ ok: false, error: e instanceof Error ? e.message : "Couldn't check Google" }),
    ),
    getPlacesPollStatus(),
    storedCounts().catch(() => null),
  ]);
  return {
    businessProfile: { missing: BUSINESS_PROFILE_ENV.filter((name) => !env(name)), setup },
    places,
    stored,
  };
}
