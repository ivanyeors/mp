import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  requireAnyAdmin: vi.fn(),
  getAuthUser: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  loadDetail: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAnyAdmin: h.requireAnyAdmin,
  requireAdmin: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/auth/user", () => ({ getAuthUser: h.getAuthUser }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    const b = {
      from: () => b,
      select: () => b,
      eq: () => b,
      maybeSingle: h.maybeSingle,
      upsert: h.upsert,
    };
    return b;
  },
}));
vi.mock("@/lib/ai/photo-screening", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/photo-screening")>()),
  screenSizingPhoto: async () => ({ status: "passed", model: "claude-haiku-5-5" }),
}));
vi.mock("@/lib/results/admin/response-detail", async (orig) => ({
  ...(await orig<typeof import("@/lib/results/admin/response-detail")>()),
  loadMpConfigResponseDetail: h.loadDetail,
}));

const { GET } = await import("@/app/api/mp-config/responses/[id]/route");
const { POST: photosPost } = await import("@/app/api/mp-config/photos/route");
const { POST: responsesPost } = await import("@/app/api/mp-config/responses/route");

const signInViewer = () =>
  h.requireAnyAdmin.mockImplementation(async (wanted: string[]) =>
    wanted.some((p) => ["orders", "analytics"].includes(p))
      ? null
      : NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  );

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: ID }) };

const liveRow = { access_token: TOKEN, customer_id: null, customer_email: null, status: "held" };

beforeEach(() => {
  vi.clearAllMocks();
  h.getAuthUser.mockResolvedValue(null);
  h.requireAnyAdmin.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
  h.maybeSingle.mockResolvedValue({ data: liveRow, error: null });
  h.upsert.mockResolvedValue({ error: null });
  h.loadDetail.mockResolvedValue({
    status: 200,
    body: {
      ok: true,
      response: { id: ID, data: { name: "Ada" }, is_final: false, customer_email: "ada@x.test" },
      order_number: null,
      order: null,
      suggestion: {
        recommended: { size: "M", tier: "premium" },
        product: { id: 3, size: "M", tier: "premium" },
        bom: [],
        reasons: ["Rules Engine graph 7"],
        graph_version_id: 7,
        recommendation_record: {},
      },
    },
  });
});

describe("GET /api/mp-config/responses/[id]", () => {
  it("refuses a stranger holding only the Result id", async () => {
    const res = await GET(new Request(`https://x.test/api/mp-config/responses/${ID}`) as never, params);
    expect(res.status).toBe(403);
  });

  it("does not run the detail load for a refused caller", async () => {
    await GET(new Request(`https://x.test/api/mp-config/responses/${ID}`) as never, params);
    expect(h.loadDetail).not.toHaveBeenCalled();
  });

  it("serves the Owner who presents the token", async () => {
    const res = await GET(
      new Request(`https://x.test/api/mp-config/responses/${ID}?token=${TOKEN}`) as never,
      params,
    );
    expect(res.status).toBe(200);
    expect(h.loadDetail).toHaveBeenCalledOnce();
  });

  it("hands the Owner the redacted payload, not the Staff one", async () => {
    const res = await GET(
      new Request(`https://x.test/api/mp-config/responses/${ID}?token=${TOKEN}`) as never,
      params,
    );
    const payload = await res.json();
    expect(payload.response).toEqual({ id: ID, data: { name: "Ada" }, is_final: false });
    expect(JSON.stringify(payload)).not.toContain("ada@x.test");
    expect(payload.suggestion).not.toHaveProperty("bom");
    expect(payload.suggestion).not.toHaveProperty("reasons");
  });

  it("hands Staff the payload unchanged", async () => {
    h.requireAnyAdmin.mockResolvedValue(null);
    const res = await GET(new Request(`https://x.test/api/mp-config/responses/${ID}`) as never, params);
    const payload = await res.json();
    expect(payload.response.customer_email).toBe("ada@x.test");
    expect(payload.suggestion.reasons).toEqual(["Rules Engine graph 7"]);
  });

  it("404s an unknown Result without consulting the gate", async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await GET(new Request(`https://x.test/api/mp-config/responses/${ID}`) as never, params);
    expect(res.status).toBe(404);
    expect(h.requireAnyAdmin).not.toHaveBeenCalled();
  });
});

describe("POST /api/mp-config/photos", () => {
  const body = (extra: Record<string, unknown> = {}) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      responseId: ID,
      view: "front",
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
      ...extra,
    }),
  });

  it("refuses a stranger holding only the Result id", async () => {
    const res = await photosPost(new Request("https://x.test/api/mp-config/photos", body()));
    expect(res.status).toBe(403);
  });

  it("does not write the photo for a refused caller", async () => {
    await photosPost(new Request("https://x.test/api/mp-config/photos", body()));
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("refuses the Owner once the Result has left draft", async () => {
    const res = await photosPost(
      new Request("https://x.test/api/mp-config/photos", body({ token: TOKEN })),
    );
    expect(res.status).toBe(403);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("accepts the Owner while it is still a Draft Result", async () => {
    h.maybeSingle.mockResolvedValue({ data: { ...liveRow, status: null }, error: null });
    const res = await photosPost(
      new Request("https://x.test/api/mp-config/photos", body({ token: TOKEN })),
    );
    expect(res.status).toBe(200);
    expect(h.upsert).toHaveBeenCalledOnce();
  });

  it("does not treat a viewer as Staff on a Result that has left draft", async () => {
    signInViewer();
    const res = await photosPost(new Request("https://x.test/api/mp-config/photos", body()));
    expect(res.status).toBe(403);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("refuses a photo for a Result that does not exist", async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await photosPost(new Request("https://x.test/api/mp-config/photos", body()));
    expect(res.status).toBe(404);
    expect(h.upsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/mp-config/responses", () => {
  it("does not treat a viewer as Staff: a held Result's measurements stay Staff-only", async () => {
    signInViewer();
    const res = await responsesPost(
      new Request("https://x.test/api/mp-config/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ID, data: { name: "Eve" } }),
      }),
    );
    expect(res.status).toBe(403);
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
