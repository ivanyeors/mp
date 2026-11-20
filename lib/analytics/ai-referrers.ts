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

const SEARCH_ENGINES: [pattern: RegExp, platform: string][] = [
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)yahoo\.[a-z.]+$/, "Yahoo"],
  [/(^|\.)baidu\.com$/, "Baidu"],
  [/(^|\.)yandex\.[a-z.]+$/, "Yandex"],
  [/(^|\.)ecosia\.org$/, "Ecosia"],
  [/(^|\.)naver\.com$/, "Naver"],
  [/(^|\.)search\.brave\.com$/, "Brave Search"],
  [/(^|\.)startpage\.com$/, "Startpage"],
];

const SOCIAL: [suffix: string, platform: string][] = [
  ["instagram.com", "Instagram"],
  ["facebook.com", "Facebook"],
  ["fb.com", "Facebook"],
  ["fb.me", "Facebook"],
  ["messenger.com", "Facebook"],
  ["tiktok.com", "TikTok"],
  ["youtube.com", "YouTube"],
  ["youtu.be", "YouTube"],
  ["t.co", "X"],
  ["x.com", "X"],
  ["twitter.com", "X"],
  ["linkedin.com", "LinkedIn"],
  ["lnkd.in", "LinkedIn"],
  ["pinterest.com", "Pinterest"],
  ["reddit.com", "Reddit"],
  ["threads.net", "Threads"],
  ["threads.com", "Threads"],
  ["xiaohongshu.com", "Xiaohongshu"],
  ["xhslink.com", "Xiaohongshu"],
  ["whatsapp.com", "WhatsApp"],
  ["wa.me", "WhatsApp"],
  ["telegram.org", "Telegram"],
  ["t.me", "Telegram"],
  ["lemon8-app.com", "Lemon8"],
];

const SOCIAL_UTM_NAMES: Record<string, string> = {
  facebook: "Facebook",
  fb: "Facebook",
  instagram: "Instagram",
  ig: "Instagram",
  meta: "Meta",
  twitter: "X",
  x: "X",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  reddit: "Reddit",
  threads: "Threads",
  xiaohongshu: "Xiaohongshu",
  xhs: "Xiaohongshu",
  rednote: "Xiaohongshu",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  lemon8: "Lemon8",
};

const SEARCH_UTM_NAMES: Record<string, string> = {
  google: "Google",
  googleads: "Google",
  adwords: "Google",
  bing: "Bing",
  microsoft: "Bing",
};

const PAID_CLICK_PLATFORM: Record<string, string> = {
  gclid: "Google",
  gbraid: "Google",
  wbraid: "Google",
  ttclid: "TikTok",
  msclkid: "Bing",
};

const APP_PLATFORM: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  threads: "Threads",
  xiaohongshu: "Xiaohongshu",
  wechat: "WeChat",
  line: "LINE",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
};

const NOT_A_SOURCE = ["mpillow.com", "stripe.com", "paynow.com.sg", "vercel.app", "localhost"];

const PAID_MEDIUMS = /^(cpc|ppc|paid|paidsearch|paid_search|paid-social|paid_social|paidsocial|display|cpm|cpv|ads?)$/i;

function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export type VisitSourceFields = {
  entry_source: string | null;
  entry_medium: string | null;
  referrer_host: string | null;
  entry_click_id_kind?: string | null;
  entry_app?: string | null;
};

export type ChannelResult = {
  channel: Channel;
  aiSource: string | null;
  platform: string | null;
};

export function aiAssistantForHost(host: string | null | undefined): string | null {
  const h = host?.trim().toLowerCase();
  if (!h) return null;
  return AI_ASSISTANTS.find(([suffix]) => hostMatches(h, suffix))?.[1] ?? null;
}

export function classifyVisit(v: VisitSourceFields): ChannelResult {
  const host = v.referrer_host?.trim().toLowerCase() || null;
  const source = v.entry_source?.trim().toLowerCase() || null;
  const medium = v.entry_medium?.trim().toLowerCase() || null;
  const clickKind = v.entry_click_id_kind?.trim().toLowerCase() || null;
  const app = v.entry_app?.trim().toLowerCase() || null;

  const aiHost = aiAssistantForHost(host);
  if (aiHost) return { channel: "ai_assistant", aiSource: aiHost, platform: null };
  const sourceName = source && source !== host ? source.replace(/^www\./, "").split(".")[0] : null;
  const aiUtm = sourceName ? AI_UTM_NAMES[sourceName] : undefined;
  if (aiUtm) return { channel: "ai_assistant", aiSource: aiUtm, platform: null };

  const searchEngine = host ? (SEARCH_ENGINES.find(([re]) => re.test(host))?.[1] ?? null) : null;
  const socialHost = host ? (SOCIAL.find(([suffix]) => hostMatches(host, suffix))?.[1] ?? null) : null;
  const socialUtm = sourceName ? (SOCIAL_UTM_NAMES[sourceName] ?? null) : null;
  const platform =
    (clickKind ? PAID_CLICK_PLATFORM[clickKind] : undefined) ??
    socialUtm ??
    (sourceName ? SEARCH_UTM_NAMES[sourceName] : undefined) ??
    socialHost ??
    searchEngine ??
    (app ? APP_PLATFORM[app] : undefined) ??
    (clickKind === "fbclid" ? "Meta" : null);
  const from = (channel: Channel): ChannelResult => ({ channel, aiSource: null, platform });
  const unnamed = (channel: Channel): ChannelResult => ({ channel, aiSource: null, platform: null });

  if (medium && PAID_MEDIUMS.test(medium)) return from("paid");
  if (clickKind && PAID_CLICK_PLATFORM[clickKind]) return from("paid");
  if (medium === "email" || source === "newsletter") return unnamed("email");
  if (medium === "social") return from("social");
  if (medium === "organic") return from("organic_search");

  if (host) {
    if (NOT_A_SOURCE.some((s) => hostMatches(host, s))) return unnamed("direct");
    if (searchEngine) return from("organic_search");
    if (socialHost) return from("social");
    return unnamed("referral");
  }
  if (source && source !== "direct") {
    if (socialUtm) return from("social");
    return from("referral");
  }
  if (platform) return from("social");
  return unnamed("direct");
}
