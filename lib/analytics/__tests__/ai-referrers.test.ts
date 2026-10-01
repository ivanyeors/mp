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
    expect(classifyVisit(visit(host))).toEqual({ channel: "ai_assistant", aiSource: name });
  });

  it("treats utm_source=chatgpt.com as AI even without a referrer", () => {
    expect(classifyVisit(visit(null, "chatgpt.com", "referral"))).toEqual({ channel: "ai_assistant", aiSource: "ChatGPT" });
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
});
