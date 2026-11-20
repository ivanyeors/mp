import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  permissions: new Set<string>(),
  row: null as { slug: string; api_key: string | null } | null,
  upserts: [] as Record<string, unknown>[],
  deletes: 0,
  check: vi.fn<(key: string) => Promise<void>>(),
  audit: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminContext: vi.fn(async (p: string) => {
    if (!h.permissions.has(p)) throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    return { memberId: "m1", userId: "u1", email: "owner@example.com", permissions: h.permissions };
  }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateTag: h.invalidate }));
vi.mock("@/lib/ai/claude", () => ({
  ANTHROPIC_CONFIG_SLUG: "anthropic",
  claudeCredentialSource: async () => (h.row?.api_key ? "saved" : null),
}));
vi.mock("@/lib/ai/claude-key", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/claude-key")>()),
  askAnthropic: (key: string) => h.check(key),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      expect(table).toBe("api_configs");
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.row, error: null }) }) }),
        upsert: async (row: Record<string, unknown>, opts: { onConflict: string }) => {
          expect(opts).toEqual({ onConflict: "slug" });
          h.upserts.push(row);
          h.row = { slug: row.slug as string, api_key: row.api_key as string };
          return { error: null };
        },
        delete: () => ({
          eq: async (col: string, value: string) => {
            expect([col, value]).toEqual(["slug", "anthropic"]);
            h.deletes++;
            h.row = null;
            return { error: null };
          },
        }),
      };
    },
  }),
}));

const { PUT, DELETE } = await import("../route");
const put = (body: unknown) =>
  PUT(new Request("http://x", { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz";

beforeEach(() => {
  vi.clearAllMocks();
  h.permissions = new Set(["api-configs"]);
  h.row = null;
  h.upserts = [];
  h.deletes = 0;
  h.check.mockResolvedValue(undefined);
});

describe("Claude API key route", () => {
  it("needs api-configs", async () => {
    h.permissions = new Set(["campaigns"]);
    expect((await put({ apiKey: KEY })).status).toBe(403);
    expect((await DELETE()).status).toBe(403);
    expect(h.check).not.toHaveBeenCalled();
    expect(h.upserts).toEqual([]);
  });

  it("saves a key Anthropic accepts, trimmed, in the anthropic row, and never sends it back", async () => {
    const res = await put({ apiKey: `  ${KEY}\n` });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, credentials: "saved" });
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(h.check).toHaveBeenCalledWith(KEY);
    expect(h.upserts).toEqual([
      { slug: "anthropic", name: "Claude (Anthropic)", base_url: "https://api.anthropic.com", api_key: KEY, is_active: true },
    ]);
    expect(h.invalidate).toHaveBeenCalledWith("api-configs");
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "settings.claude_key_add", entityType: "api_config", entityId: "anthropic", before: { saved: false }, after: { saved: true } }),
    );
    expect(JSON.stringify(h.audit.mock.calls)).not.toContain(KEY);
  });

  it("records a second save as a replacement", async () => {
    h.row = { slug: "anthropic", api_key: "sk-ant-old-key-0000000000" };
    expect((await put({ apiKey: KEY })).status).toBe(200);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "settings.claude_key_replace", before: { saved: true } }));
  });

  it("refuses what isn't a key before asking Anthropic", async () => {
    for (const apiKey of ["", "sk-ant-short", "sk-ant-api03 with spaces in it", "x".repeat(501)]) {
      const res = await put({ apiKey });
      expect(res.status).toBe(400);
      expect(typeof (await res.json()).error).toBe("string");
    }
    expect((await put(null)).status).toBe(400);
    expect(h.check).not.toHaveBeenCalled();
    expect(h.upserts).toEqual([]);
  });

  it("refuses a key Anthropic rejects, saying why, and saves nothing", async () => {
    h.check.mockRejectedValue(new Anthropic.AuthenticationError(401, { type: "error" }, "invalid x-api-key", new Headers()));
    const res = await put({ apiKey: KEY });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Anthropic didn't accept this key. Check it was copied whole, or make a new one." });
    h.check.mockRejectedValue(new Error("fetch failed"));
    expect((await (await put({ apiKey: KEY })).json()).error).toBe("Couldn't reach Anthropic to check the key. Try again in a minute.");
    expect(h.upserts).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("removes a saved key, and removing none changes nothing", async () => {
    h.row = { slug: "anthropic", api_key: KEY };
    const res = await DELETE();
    expect(await res.json()).toEqual({ ok: true, credentials: null });
    expect(h.deletes).toBe(1);
    expect(h.invalidate).toHaveBeenCalledWith("api-configs");
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "settings.claude_key_remove", after: { saved: false } }));
    vi.clearAllMocks();
    expect((await DELETE()).status).toBe(200);
    expect(h.deletes).toBe(1);
    expect(h.audit).not.toHaveBeenCalled();
  });
});
