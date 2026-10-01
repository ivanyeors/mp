/**
 * Traffic channel for a Visit, with AI assistants as their own channel
 * (slice 03, PRD-search-visibility).
 *
 * Classified at read time from the frozen Entry source fields on
 * `analytics_visits`, so the whole history since July 2026 is covered and a
 * new AI host only needs a line here, not a backfill. GA4's built-in AI
 * Assistant channel misses Perplexity and is not retroactive; this is the
 * first-party source of truth.
 *
 * AI visits without a referrer (app clients, copy-pasted links) land in
 * Direct, so the AI channel is a floor, never the full count.
 */

export type Channel = "ai_assistant" | "organic_search" | "paid" | "social" | "email" | "referral" | "direct";

export const CHANNEL_LABELS: Record<Channel, string> = {
  organic_search: "Organic search",
  ai_assistant: "AI assistant",
  direct: "Direct",
  referral: "Referral",
  social: "Social",
  paid: "Paid",
  email: "Email",
};

/** Host suffix → AI assistant. Checked before search engines (gemini.google.com is not Google search). */
const AI_ASSISTANTS: [suffix: string, name: string][] = [
  ["chatgpt.com", "ChatGPT"],
  ["chat.openai.com", "ChatGPT"],
  ["perplexity.ai", "Perplexity"],
  ["gemini.google.com", "Gemini"],
  ["bard.google.com", "Gemini"],
  ["copilot.microsoft.com", "Copilot"],
  ["edgeservices.bing.com", "Copilot"],
  ["claude.ai", "Claude"],
  ["deepseek.com", "DeepSeek"],
  ["grok.com", "Grok"],
  ["meta.ai", "Meta AI"],
  ["chat.mistral.ai", "Mistral"],
  ["you.com", "You.com"],
  ["poe.com", "Poe"],
  ["phind.com", "Phind"],
];

/**
 * Bare utm_source values for AI assistants (ChatGPT tags links `utm_source=chatgpt.com`).
 * Exact match on the first label, so a lookalike such as `notchatgpt.com` is not AI.
 */
const AI_UTM_NAMES: Record<string, string> = {
  chatgpt: "ChatGPT",
  openai: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  copilot: "Copilot",
  claude: "Claude",
  deepseek: "DeepSeek",
  grok: "Grok",
};

const SEARCH_ENGINES = [
  /(^|\.)google\.[a-z.]+$/,
  /(^|\.)bing\.com$/,
  /(^|\.)duckduckgo\.com$/,
  /(^|\.)yahoo\.[a-z.]+$/,
  /(^|\.)baidu\.com$/,
  /(^|\.)yandex\.[a-z.]+$/,
  /(^|\.)ecosia\.org$/,
  /(^|\.)naver\.com$/,
  /(^|\.)search\.brave\.com$/,
  /(^|\.)startpage\.com$/,
];

const SOCIAL = [
  "facebook.com", "fb.com", "instagram.com", "t.co", "x.com", "twitter.com", "linkedin.com", "lnkd.in",
  "tiktok.com", "youtube.com", "youtu.be", "pinterest.com", "reddit.com", "threads.net", "xiaohongshu.com",
  "whatsapp.com", "wa.me", "telegram.org", "t.me", "lemon8-app.com",
];

/** Bare utm_source values (no referrer) that mean social. Exact match only. */
const SOCIAL_UTM_NAMES = new Set([
  "facebook", "fb", "instagram", "ig", "twitter", "x", "linkedin", "tiktok", "youtube", "pinterest",
  "reddit", "threads", "xiaohongshu", "xhs", "whatsapp", "telegram", "lemon8",
]);

/** Our own hosts and payment round-trips are not acquisition sources. */
const NOT_A_SOURCE = ["mpillow.com", "stripe.com", "paynow.com.sg", "vercel.app", "localhost"];

const PAID_MEDIUMS = /^(cpc|ppc|paid|paidsearch|paid_search|paid-social|paid_social|paidsocial|display|cpm|cpv|ads?)$/i;

function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export type VisitSourceFields = {
  entry_source: string | null;
  entry_medium: string | null;
  referrer_host: string | null;
};

export type ChannelResult = { channel: Channel; aiSource: string | null };

export function aiAssistantForHost(host: string | null | undefined): string | null {
  const h = host?.trim().toLowerCase();
  if (!h) return null;
  return AI_ASSISTANTS.find(([suffix]) => hostMatches(h, suffix))?.[1] ?? null;
}

export function classifyVisit(v: VisitSourceFields): ChannelResult {
  const host = v.referrer_host?.trim().toLowerCase() || null;
  const source = v.entry_source?.trim().toLowerCase() || null;
  const medium = v.entry_medium?.trim().toLowerCase() || null;

  // AI first: a utm_source=chatgpt.com click is AI even when the medium says "referral".
  const aiHost = aiAssistantForHost(host);
  if (aiHost) return { channel: "ai_assistant", aiSource: aiHost };
  // Only when the source came from UTM; when it is just the referrer host, the host check above decided.
  const sourceName = source && source !== host ? source.replace(/^www\./, "").split(".")[0] : null;
  const aiUtm = sourceName ? AI_UTM_NAMES[sourceName] : undefined;
  if (aiUtm) return { channel: "ai_assistant", aiSource: aiUtm };

  if (medium && PAID_MEDIUMS.test(medium)) return { channel: "paid", aiSource: null };
  if (medium === "email" || source === "newsletter") return { channel: "email", aiSource: null };
  if (medium === "social") return { channel: "social", aiSource: null };
  if (medium === "organic") return { channel: "organic_search", aiSource: null };

  if (host) {
    if (NOT_A_SOURCE.some((s) => hostMatches(host, s))) return { channel: "direct", aiSource: null };
    if (SEARCH_ENGINES.some((re) => re.test(host))) return { channel: "organic_search", aiSource: null };
    if (SOCIAL.some((s) => hostMatches(host, s))) return { channel: "social", aiSource: null };
    return { channel: "referral", aiSource: null };
  }
  // A UTM source with no medium and no referrer, e.g. ?utm_source=instagram on a bio link.
  if (source && source !== "direct") {
    if (sourceName && SOCIAL_UTM_NAMES.has(sourceName)) return { channel: "social", aiSource: null };
    return { channel: "referral", aiSource: null };
  }
  return { channel: "direct", aiSource: null };
}
