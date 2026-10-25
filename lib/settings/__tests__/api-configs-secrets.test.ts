import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

import { keepStoredSecrets, toClientApiConfig, type ApiConfigRow } from "@/lib/settings/api-configs";

const row: ApiConfigRow = {
  id: "1",
  name: "Easyship",
  slug: "easyship",
  base_url: "https://api.easyship.com",
  api_key: "prod_secret_key",
  config: { sync: { webhook_secret_token: "whsec", label: "x" }, other: 1 },
  is_active: true,
  created_at: "2026-01-01",
};

describe("toClientApiConfig", () => {
  it("never sends the key or the webhook secret, only that they are set", () => {
    const client = toClientApiConfig(row);
    expect(client.api_key).toBe("");
    expect(client.api_key_set).toBe(true);
    expect(JSON.stringify(client)).not.toContain("prod_secret_key");
    expect(JSON.stringify(client)).not.toContain("whsec");
    expect(client.config).toEqual({ sync: { label: "x", webhook_secret_set: true }, other: 1 });
  });
});

describe("keepStoredSecrets", () => {
  it("keeps the stored key when the form leaves it blank, and replaces it when typed", () => {
    expect(keepStoredSecrets(row, { api_key: "", name: "E" })).toEqual({ name: "E" });
    expect(keepStoredSecrets(row, { api_key: "new" })).toEqual({ api_key: "new" });
  });

  it("puts the webhook secret back into a config edited without it", () => {
    const edited = toClientApiConfig(row).config;
    expect(keepStoredSecrets(row, { config: edited }).config).toEqual({
      sync: { label: "x", webhook_secret_token: "whsec" },
      other: 1,
    });
  });
});
