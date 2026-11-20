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

const MARKERS: [app: EntryApp, pattern: RegExp][] = [
  ["threads", /\bBarcelona\b/],
  ["instagram", /\bInstagram\b/],
  ["facebook", /\bFBAN\/|\bFBAV\/|\bFB_IAB\/|\bMessenger/],
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
