import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claudeClient, claudeConfigured, claudeCredentialSource } from "@/lib/ai/claude";
import { claudeConfigured as reviewRepliesCheck } from "@/lib/reviews/draft-reply";

/**
 * The shared credentials check (PRD-campaign-email-editor slice 16) and client
 * (slice 09), the ones review replies use: the key saved on General first,
 * then the environment's key, then the federation rule.
 */

const h = vi.hoisted(() => ({
  rows: [] as { slug: string; api_key: string; is_active: boolean }[],
  readFails: false,
}));

vi.mock("@/lib/settings/api-configs", () => ({
  readApiConfigs: async () => {
    if (h.readFails) throw new Error("Invariant: incrementalCache missing in unstable_cache");
    return h.rows;
  },
}));

beforeEach(() => {
  h.rows = [];
  h.readFails = false;
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("ANTHROPIC_FEDERATION_RULE_ID", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const saved = (api_key: string, is_active = true) => {
  h.rows = [{ slug: "easyship", api_key: "es-key", is_active: true }, { slug: "anthropic", api_key, is_active }];
};

describe("claudeCredentialSource", () => {
  it("is the saved key, then the environment's key, then the federation rule, else none", async () => {
    vi.stubEnv("ANTHROPIC_FEDERATION_RULE_ID", " ");
    expect(await claudeCredentialSource()).toBeNull();
    expect(await claudeConfigured()).toBe(false);
    vi.stubEnv("ANTHROPIC_FEDERATION_RULE_ID", "fdrl_123");
    expect(await claudeCredentialSource()).toBe("federation");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(await claudeCredentialSource()).toBe("environment");
    saved("sk-ant-saved");
    expect(await claudeCredentialSource()).toBe("saved");
    expect(await claudeConfigured()).toBe(true);
  });

  it("skips a saved row that is switched off or holds no key", async () => {
    saved("sk-ant-saved", false);
    expect(await claudeCredentialSource()).toBeNull();
    saved("  ");
    expect(await claudeCredentialSource()).toBeNull();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(await claudeCredentialSource()).toBe("environment");
  });

  it("falls back to the environment where the saved key can't be read (scripts, tests)", async () => {
    h.readFails = true;
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(await claudeCredentialSource()).toBe("environment");
  });

  it("is the same check review replies make", () => {
    expect(reviewRepliesCheck).toBe(claudeConfigured);
  });
});

describe("claudeClient", () => {
  it("is none without credentials, and one client for every caller with them", async () => {
    expect(await claudeClient()).toBeNull();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const client = await claudeClient();
    expect(client?.apiKey).toBe("sk-test");
    expect(await claudeClient()).toBe(client);
  });

  it("uses the saved key, and a new client once the key changes", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    saved("sk-ant-first");
    const first = await claudeClient();
    expect(first?.apiKey).toBe("sk-ant-first");
    saved("sk-ant-second");
    const second = await claudeClient();
    expect(second).not.toBe(first);
    expect(second?.apiKey).toBe("sk-ant-second");
    h.rows = [];
    expect((await claudeClient())?.apiKey).toBe("sk-test");
  });
});
