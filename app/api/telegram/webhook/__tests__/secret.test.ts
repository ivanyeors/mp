import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: vi.fn() }));

const { GET, POST } = await import("@/app/api/telegram/webhook/route");

const SECRET = "tg-secret";

function post(header?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (header !== undefined) headers["x-telegram-bot-api-secret-token"] = header;
  return new Request("https://x.test/api/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify({ update_id: 1 }),
  }) as never;
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/telegram/webhook in production", () => {
  it("refuses when the secret is unset", async () => {
    expect((await POST(post())).status).toBe(401);
    expect((await POST(post("anything"))).status).toBe(401);
  });

  it("refuses a missing or wrong secret header", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
    expect((await POST(post())).status).toBe(401);
    expect((await POST(post("wrong"))).status).toBe(401);
  });

  it("accepts the configured secret", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
    expect((await POST(post(SECRET))).status).toBe(200);
  });
});

describe("GET /api/telegram/webhook", () => {
  it("does not report which env vars are configured", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot");
    expect(await (await GET()).json()).toEqual({ ok: true });
  });
});
