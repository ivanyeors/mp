import { describe, expect, it } from "vitest";
import { classifyVisit } from "@/lib/analytics/ai-referrers";

const visit = (referrer_host: string | null, entry_source: string | null = referrer_host ?? "Direct", entry_medium: string | null = null) => ({
  referrer_host,
  entry_source,
  entry_medium,
});

describe("classifyVisit", () => {
  it.each([
    ["chatgpt.com", "ChatGPT"],
    ["chat.openai.com", "ChatGPT"],
    ["www.perplexity.ai", "Perplexity"],
    ["gemini.google.com", "Gemini"],
    ["copilot.microsoft.com", "Copilot"],
    ["edgeservices.bing.com", "Copilot"],
    ["claude.ai", "Claude"],
    ["chat.deepseek.com", "DeepSeek"],
  ])("%s is an AI assistant (%s)", (host, name) => {
    expect(classifyVisit(visit(host))).toEqual({ channel: "ai_assistant", aiSource: name, platform: null });
  });

  it("treats utm_source=chatgpt.com as AI even without a referrer", () => {
    expect(classifyVisit(visit(null, "chatgpt.com", "referral"))).toEqual({ channel: "ai_assistant", aiSource: "ChatGPT", platform: null });
  });

  it.each(["www.google.com", "www.google.com.sg", "bing.com", "duckduckgo.com", "search.yahoo.com"])(
    "%s is organic search",
    (host) => expect(classifyVisit(visit(host)).channel).toBe("organic_search"),
  );

  it("does not confuse Gemini with Google search, or lookalike hosts with AI", () => {
    expect(classifyVisit(visit("gemini.google.com")).channel).toBe("ai_assistant");
    expect(classifyVisit(visit("notchatgpt.com")).channel).toBe("referral");
  });

  it.each(["l.facebook.com", "l.instagram.com", "t.co", "www.reddit.com", "lnkd.in"])("%s is social", (host) =>
    expect(classifyVisit(visit(host)).channel).toBe("social"),
  );

  it("uses the medium for paid, email and social campaigns", () => {
    expect(classifyVisit(visit(null, "google", "cpc")).channel).toBe("paid");
    expect(classifyVisit(visit(null, "newsletter", "email")).channel).toBe("email");
    expect(classifyVisit(visit(null, "instagram", null)).channel).toBe("social");
  });

  it("does not match a social name by substring", () => {
    expect(classifyVisit(visit(null, "partner-site", null)).channel).toBe("referral");
  });

  it("counts own-site and payment round-trips as direct, not referral", () => {
    expect(classifyVisit(visit("custom.mpillow.com")).channel).toBe("direct");
    expect(classifyVisit(visit("checkout.stripe.com")).channel).toBe("direct");
    expect(classifyVisit(visit(null)).channel).toBe("direct");
  });

  it("falls back to referral for any other site", () => {
    expect(classifyVisit(visit("honeycombers.com")).channel).toBe("referral");
  });

  describe("platform", () => {
    const signals = (extra: { entry_click_id_kind?: string; entry_app?: string }, host: string | null = null) => ({
      ...visit(host),
      ...extra,
    });

    it("names the platform a referrer or tag points at", () => {
      expect(classifyVisit(visit("www.google.com"))).toMatchObject({ channel: "organic_search", platform: "Google" });
      expect(classifyVisit(visit("l.instagram.com"))).toMatchObject({ channel: "social", platform: "Instagram" });
      expect(classifyVisit(visit("lm.facebook.com"))).toMatchObject({ channel: "social", platform: "Facebook" });
      expect(classifyVisit(visit(null, "ig", null))).toMatchObject({ channel: "social", platform: "Instagram" });
      expect(classifyVisit(visit(null, "tiktok", "paid_social"))).toMatchObject({ channel: "paid", platform: "TikTok" });
      expect(classifyVisit(visit(null, "meta", "cpc"))).toMatchObject({ channel: "paid", platform: "Meta" });
    });

    it("reads an untagged Google Ads click as paid, not organic search", () => {
      expect(classifyVisit(signals({ entry_click_id_kind: "gclid" }, "www.google.com"))).toEqual({
        channel: "paid",
        aiSource: null,
        platform: "Google",
      });
      expect(classifyVisit(signals({ entry_click_id_kind: "wbraid" }))).toMatchObject({ channel: "paid", platform: "Google" });
      expect(classifyVisit(signals({ entry_click_id_kind: "ttclid" }))).toMatchObject({ channel: "paid", platform: "TikTok" });
    });

    it("does not call an fbclid click paid: Meta adds it to organic links too", () => {
      expect(classifyVisit(signals({ entry_click_id_kind: "fbclid" }))).toMatchObject({ channel: "social", platform: "Meta" });
      expect(classifyVisit(signals({ entry_click_id_kind: "fbclid" }, "l.facebook.com")).platform).toBe("Facebook");
      expect(classifyVisit(signals({ entry_click_id_kind: "fbclid", entry_app: "instagram" })).platform).toBe("Instagram");
    });

    it("takes an untagged Visit from an app's own browser out of Direct", () => {
      expect(classifyVisit(signals({ entry_app: "tiktok" }))).toEqual({ channel: "social", aiSource: null, platform: "TikTok" });
      expect(classifyVisit(signals({ entry_app: "instagram" }))).toMatchObject({ channel: "social", platform: "Instagram" });
      expect(classifyVisit(visit(null))).toEqual({ channel: "direct", aiSource: null, platform: null });
    });

    it("leaves an email opened inside an app as Email, with no platform", () => {
      expect(classifyVisit({ ...visit(null, "email_campaign", "email"), entry_app: "instagram" })).toEqual({
        channel: "email",
        aiSource: null,
        platform: null,
      });
      expect(classifyVisit(visit("honeycombers.com")).platform).toBeNull();
    });
  });
});
