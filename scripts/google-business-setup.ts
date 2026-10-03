/**
 * Google Business Profile setup + diagnostics for review replies
 * (.claude/PRD-google-review-replies/OPS-CHECKLIST.md).
 *
 *   # 1. Check access, find the location, read a review:
 *   npx tsx --env-file=.env.local scripts/google-business-setup.ts
 *
 *   # 2. Point NEW_REVIEW / UPDATED_REVIEW notifications at a Pub/Sub topic:
 *   npx tsx --env-file=.env.local scripts/google-business-setup.ts --notify projects/<gcp-project>/topics/<topic>
 *
 * Needs GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET and
 * GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN — a refresh token for the account that
 * manages the Business Profile (sg@mpillow.com) with scope business.manage.
 * Read-only unless --notify is given.
 */
import { OAuth2Client } from "google-auth-library";
import { BUSINESS_MANAGE_SCOPE, starRatingToNumber } from "../lib/google/business-profile";

const ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const NOTIFY = "https://mybusinessnotifications.googleapis.com/v1";
const V4 = "https://mybusiness.googleapis.com/v4";

type Json = Record<string, unknown>;

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function call(token: string, url: string, init?: { method?: string; body?: unknown }): Promise<Json> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    const error = (json.error ?? {}) as { message?: string; status?: string };
    const message = `${res.status} ${error.status ?? ""} ${error.message ?? ""}`.trim();
    throw new Error(
      /quota/i.test(message) && /0/.test(message)
        ? `${message}\n   → The Cloud project has 0 quota: Business Profile API access is not approved yet.`
        : message,
    );
  }
  return json;
}

async function main() {
  const oauth = new OAuth2Client(need("GOOGLE_OAUTH_CLIENT_ID"), need("GOOGLE_OAUTH_CLIENT_SECRET"));
  oauth.setCredentials({ refresh_token: need("GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN") });
  const { token } = await oauth.getAccessToken();
  if (!token) throw new Error("The refresh token returned no access token");

  const info = (await (
    await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`)
  ).json()) as { email?: string; scope?: string };
  const scopes = (info.scope ?? "").split(/\s+/);
  console.log(`Token for ${info.email ?? "(email not in token)"}`);
  console.log(`  business.manage scope: ${scopes.includes(BUSINESS_MANAGE_SCOPE) ? "yes" : "NO — re-issue the token with it"}`);

  const accounts = ((await call(token, `${ACCOUNTS}/accounts`)).accounts ?? []) as {
    name: string;
    accountName?: string;
    type?: string;
  }[];
  console.log(`\nAccounts: ${accounts.length}`);
  for (const account of accounts) {
    console.log(`■ ${account.accountName ?? "(unnamed)"}  ${account.name}  [${account.type ?? "?"}]`);
    const locations = ((
      await call(token, `${INFO}/${account.name}/locations?readMask=name,title&pageSize=100`)
    ).locations ?? []) as { name: string; title?: string }[];
    for (const location of locations) {
      const full = `${account.name}/${location.name}`;
      const mark = process.env.GOOGLE_BUSINESS_LOCATION?.trim() === full ? "   ← configured" : "";
      console.log(`    · ${location.title ?? "(untitled)"}\n      GOOGLE_BUSINESS_LOCATION=${full}${mark}`);
    }
  }

  const location = process.env.GOOGLE_BUSINESS_LOCATION?.trim();
  if (location) {
    const page = await call(token, `${V4}/${location}/reviews?pageSize=5`);
    const reviews = (page.reviews ?? []) as {
      starRating?: string;
      comment?: string;
      reviewer?: { displayName?: string };
      reviewReply?: unknown;
    }[];
    console.log(
      `\nReviews on ${location}: ${page.totalReviewCount ?? "?"} total, average ${page.averageRating ?? "?"}`,
    );
    for (const r of reviews) {
      const text = (r.comment ?? "(rating only)").replace(/\s+/g, " ").slice(0, 80);
      console.log(
        `  ${starRatingToNumber(r.starRating) ?? "?"}★ ${r.reviewer?.displayName ?? "?"}: ${text}${r.reviewReply ? "  [replied]" : ""}`,
      );
    }
  } else {
    console.log("\nSet GOOGLE_BUSINESS_LOCATION to one of the values above, then run again to test reading reviews.");
  }

  const topicIndex = process.argv.indexOf("--notify");
  if (topicIndex !== -1) {
    const topic = process.argv[topicIndex + 1];
    if (!topic || !/^projects\/[^/]+\/topics\/[^/]+$/.test(topic)) {
      throw new Error("--notify needs projects/<gcp-project>/topics/<topic>");
    }
    if (!location) throw new Error("Set GOOGLE_BUSINESS_LOCATION first — its account receives the setting");
    const account = location.split("/locations/")[0];
    const setting = await call(
      token,
      `${NOTIFY}/${account}/notificationSetting?updateMask=pubsubTopic,notificationTypes`,
      {
        method: "PATCH",
        body: {
          name: `${account}/notificationSetting`,
          pubsubTopic: topic,
          notificationTypes: ["NEW_REVIEW", "UPDATED_REVIEW"],
        },
      },
    );
    console.log("\nNotification setting saved:", JSON.stringify(setting));
  }
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
