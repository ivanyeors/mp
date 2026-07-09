/**
 * Runnable self-check for shouldTrackFetchRequest.
 * Run: npx tsx components/api-request-tracker.check.ts
 */
import { shouldTrackFetchRequest } from "./api-request-tracker";

const ORIGIN = "http://localhost:3000";

function assertTrack(url: string, method: string, msg: string) {
  if (!shouldTrackFetchRequest(url, method, ORIGIN)) {
    throw new Error(`expected track: ${msg} (${method} ${url})`);
  }
}

function assertSkip(url: string, method: string, msg: string) {
  if (shouldTrackFetchRequest(url, method, ORIGIN)) {
    throw new Error(`expected skip: ${msg} (${method} ${url})`);
  }
}

assertTrack("/api/foo", "GET", "same-origin /api GET");
assertTrack("/en-US/settings/inventory", "POST", "server action POST");
assertTrack("/en-US/settings/inventory/configure/save", "POST", "settings save route");
assertTrack("/shop/checkout", "PATCH", "same-origin mutation");

assertSkip("/en-US/settings/inventory", "GET", "same-origin page GET");
assertSkip("https://example.com/api/foo", "POST", "cross-origin POST");
assertSkip("/api/foo", "HEAD", "HEAD on /api");
assertSkip("/api/foo", "OPTIONS", "OPTIONS on /api");

console.log("api-request-tracker: all checks passed");
