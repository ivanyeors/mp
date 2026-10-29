import { afterEach, describe, expect, it, vi } from "vitest";
import { claudeConfigured } from "@/lib/ai/claude";
import { claudeConfigured as reviewRepliesCheck } from "@/lib/reviews/draft-reply";

/** The shared credentials check (PRD-campaign-email-editor slice 16), the one review replies use. */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("claudeConfigured", () => {
  it("is true with an API key or a federation rule, false with neither", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_FEDERATION_RULE_ID", " ");
    expect(claudeConfigured()).toBe(false);
    vi.stubEnv("ANTHROPIC_FEDERATION_RULE_ID", "fdrl_123");
    expect(claudeConfigured()).toBe(true);
    vi.stubEnv("ANTHROPIC_FEDERATION_RULE_ID", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(claudeConfigured()).toBe(true);
  });

  it("is the same check review replies make", () => {
    expect(reviewRepliesCheck).toBe(claudeConfigured);
  });
});
