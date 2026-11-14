/**
 * Which app's built-in browser a Visit started in, read from the request's
 * User-Agent at Visit start.
 *
 * Instagram, Facebook and TikTok open links in their own browser and usually
 * send no referrer, so an untagged bio link or shared post lands as Direct.
 * The in-app browser names itself in the User-Agent, and a page only opens
 * there from a link inside that app, so the app is the Visit's origin.
 *
 * Only the app's name is kept, never the User-Agent: it classifies a Visit and
 * identifies nobody (ADR 0007 still bars the User-Agent from identity).
 */

export const ENTRY_APPS = [
  "instagram",
  "facebook",
  "tiktok",
  "threads",
  "xiaohongshu",
  "wechat",
  "line",
  "linkedin",
  "pinterest",
  "snapchat",
] as const;
export type EntryApp = (typeof ENTRY_APPS)[number];

/** Checked in order: Threads and Instagram both run on Meta's shell, which also says FBAN/FBAV. */
const MARKERS: [app: EntryApp, pattern: RegExp][] = [
  ["threads", /\bBarcelona\b/],
  ["instagram", /\bInstagram\b/],
  ["facebook", /\bFBAN\/|\bFBAV\/|\bFB_IAB\/|\bMessenger/],
  // musical_ly is TikTok's international build, trill its South-East Asian one.
  ["tiktok", /musical_ly|\btrill_|BytedanceWebview|\bTikTok\b/i],
  ["xiaohongshu", /xhsdiscover|XiaoHongShu/i],
  ["wechat", /\bMicroMessenger\//],
  ["line", /\bLine\/\d/],
  ["linkedin", /\bLinkedInApp\b/],
  ["pinterest", /\bPinterest\b/],
  ["snapchat", /\bSnapchat\b/],
];

export function entryAppFromUserAgent(userAgent: string | null | undefined): EntryApp | null {
  const ua = userAgent?.trim();
  if (!ua) return null;
  return MARKERS.find(([, pattern]) => pattern.test(ua))?.[0] ?? null;
}

export function isEntryApp(value: unknown): value is EntryApp {
  return typeof value === "string" && (ENTRY_APPS as readonly string[]).includes(value);
}
