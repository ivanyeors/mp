import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { PhotoScreening } from "@/lib/ai/photo-screening";

const h = vi.hoisted(() => ({
  upsert: vi.fn(),
  screen: vi.fn(),
  limited: vi.fn(),
  after: vi.fn(),
  move: vi.fn(),
}));

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: h.after }));
vi.mock("@/lib/results/sizing-photo-drive", () => ({ moveSizingPhotosToDrive: h.move }));

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
  h.move.mockResolvedValue({ configured: true, moved: 1, failed: 0 });
});

describe("POST /api/mp-config/photos screening", () => {
  it("keeps a photo that passed as WebP, marked with the model and when", async () => {
    screenAs({ status: "passed", model: "claude-haiku-5-5", view: "side" });
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
        screened_view: "side",
      }),
      { onConflict: "response_id,view" },
    );
  });

  it("files a front photo taken from behind under the view Claude saw", async () => {
    screenAs({ status: "passed", model: "claude-haiku-5-5", view: "back" });
    await post(PNG, "front");
    expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({ view: "front", screened_view: "back" }), expect.anything());
  });

  it("moves the saved photo to Drive only after the customer has their answer", async () => {
    screenAs({ status: "passed", model: "claude-haiku-5-5", view: "side" });
    const res = await post();
    expect(res.status).toBe(200);
    expect(h.move).not.toHaveBeenCalled();
    expect(h.after).toHaveBeenCalledTimes(1);
    await h.after.mock.calls[0][0]();
    expect(h.move).toHaveBeenCalledWith(expect.anything(), { responseId: ID });
  });

  it("a failed move to Drive is logged and never reaches the customer", async () => {
    screenAs({ status: "passed", model: "claude-haiku-5-5", view: "side" });
    h.move.mockRejectedValue(new Error("Drive down"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await post()).status).toBe(200);
    await expect(h.after.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledWith(`[sizing-photo] ${ID} move to Drive failed:`, expect.any(Error));
  });

  it("schedules no move when the photo wasn't saved", async () => {
    screenAs({ status: "passed", model: "claude-haiku-5-5", view: "side" });
    h.upsert.mockResolvedValue({ error: { message: "db down" } });
    expect((await post()).status).toBe(500);
    expect(h.after).not.toHaveBeenCalled();
  });

  it("never stores a photo Claude rejected, and tells the customer why", async () => {
    screenAs({ status: "rejected", reason: "This doesn't look like a side view." });
    const res = await post();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "This doesn't look like a side view.", screening: "rejected" });
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.after).not.toHaveBeenCalled();
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
