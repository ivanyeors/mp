import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { PhotoScreening } from "@/lib/ai/photo-screening";

const h = vi.hoisted(() => ({
  upsert: vi.fn(),
  screen: vi.fn(),
  limited: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    const b = {
      from: () => b,
      select: () => b,
      eq: () => b,
      maybeSingle: async () => ({ data: { access_token: null, customer_id: null, customer_email: null, status: null }, error: null }),
      upsert: h.upsert,
    };
    return b;
  },
}));
vi.mock("@/lib/results/access", () => ({ requireResultAccess: async () => ({ ok: true }) }));
vi.mock("@/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/rate-limit")>()),
  tooManyRequests: h.limited,
}));
vi.mock("@/lib/ai/photo-screening", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/photo-screening")>()),
  screenSizingPhoto: h.screen,
}));

const { POST } = await import("@/app/api/mp-config/photos/route");

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const post = (dataUrl = PNG, view = "side") =>
  POST(
    new Request("https://x.test/api/mp-config/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responseId: ID, view, dataUrl }),
    }),
  );

const screenAs = (result: PhotoScreening) => h.screen.mockResolvedValue(result);

beforeEach(() => {
  vi.clearAllMocks();
  h.upsert.mockResolvedValue({ error: null });
  h.limited.mockResolvedValue(null);
});

describe("POST /api/mp-config/photos screening", () => {
  it("keeps a photo that passed as WebP, marked with the model and when", async () => {
    screenAs({ status: "passed", model: "claude-haiku-5-5" });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, screening: "passed" });
    const [screened, view] = h.screen.mock.calls[0];
    expect(view).toBe("side");
    expect(screened.mediaType).toBe("image/webp");
    expect(h.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        view: "side",
        data_url: `data:image/webp;base64,${screened.base64}`,
        screening_status: "passed",
        screening_model: "claude-haiku-5-5",
        screened_at: expect.any(String),
      }),
      { onConflict: "response_id,view" },
    );
  });

  it("never stores a photo Claude rejected, and tells the customer why", async () => {
    screenAs({ status: "rejected", reason: "This doesn't look like a side view." });
    const res = await post();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "This doesn't look like a side view.", screening: "rejected" });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("keeps a photo Claude couldn't check, marked unchecked", async () => {
    screenAs({ status: "unchecked", error: "Claude is not configured" });
    const res = await post();
    expect(await res.json()).toEqual({ ok: true, screening: "unchecked" });
    expect(h.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ screening_status: "unchecked", screening_model: null, screened_at: null }),
      expect.anything(),
    );
  });

  it("turns down an image sharp can't read before asking Claude", async () => {
    const res = await post(`data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(40, 7)]).toString("base64")}`);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "We couldn't read this photo. Please take another one.", screening: "rejected" });
    expect(h.screen).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("turns down a file Claude can't read before asking it", async () => {
    const heic = `data:image/heic;base64,${Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic")]).toString("base64")}`;
    const res = await post(heic);
    expect(res.status).toBe(422);
    expect(h.screen).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("stops at the rate limit without asking Claude", async () => {
    h.limited.mockResolvedValue(NextResponse.json({ error: "slow down" }, { status: 429 }));
    const res = await post();
    expect(res.status).toBe(429);
    expect(h.screen).not.toHaveBeenCalled();
    expect(h.limited).toHaveBeenCalledWith(
      [expect.objectContaining({ bucket: "sizing-photo-screen", key: ID }), expect.objectContaining({ bucket: "sizing-photo-screen-ip" })],
      expect.any(String),
    );
  });
});
