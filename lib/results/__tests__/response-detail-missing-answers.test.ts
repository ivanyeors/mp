import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A Result whose answers the published rule graph cannot evaluate (a Draft
 * mid-questionnaire, or one saved before the sleep answers were kept) must
 * still load: the suggestion is advice, the Result is the record. It used to
 * come back as a 422, and the detail page showed "Couldn't find or load this
 * result" with no way in.
 */

const h = vi.hoisted(() => ({
  responseRow: null as Record<string, unknown> | null,
  update: vi.fn(),
  recommend: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    let table = "";
    const b = {
      from: (t: string) => {
        table = t;
        return b;
      },
      select: () => b,
      eq: () => b,
      neq: () => b,
      update: (...args: unknown[]) => {
        h.update(...args);
        return b;
      },
      maybeSingle: async () =>
        table === "mp_config_responses" ? { data: h.responseRow, error: null } : { data: null, error: null },
    };
    return b;
  },
}));
vi.mock("@/lib/discovery-source", () => ({
  getDiscoverySourceCatalog: vi.fn().mockResolvedValue([]),
  resolveDiscoverySourceLabel: () => null,
}));
vi.mock("@/lib/rules-engine", async (orig) => ({
  ...(await orig<typeof import("@/lib/rules-engine")>()),
  recommendWithEngine: h.recommend,
}));

const { loadMpConfigResponseDetail, toOwnerResultPayload } = await import(
  "@/lib/results/admin/response-detail"
);

const ID = "18b85171-46f6-49b0-95d6-0ba9d0a56bfa";

beforeEach(() => {
  vi.clearAllMocks();
  h.responseRow = {
    id: ID,
    data: { name: "Ada", shoulderLength: "43.18", acidReflux: "no" },
    is_final: false,
    status: null,
    order_id: null,
    paired_build_id: null,
    recommendation_record: null,
  };
  h.recommend.mockResolvedValue({
    error: "Missing required inputs: sleep_position, sleep_pain_areas, uses_bolster",
    missing: ["sleep_position", "sleep_pain_areas", "uses_bolster"],
  });
});

describe("loadMpConfigResponseDetail when the rules cannot run", () => {
  it("loads the Result with no suggestion and names the missing answers", async () => {
    const result = await loadMpConfigResponseDetail(ID);
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.response.id).toBe(ID);
    expect(result.body.response.data).toEqual(h.responseRow!.data);
    expect(result.body.suggestion).toBeNull();
    expect(result.body.suggestion_missing).toEqual(["sleep_position", "sleep_pain_areas", "uses_bolster"]);
  });

  it("writes no recommendation record it does not have", async () => {
    await loadMpConfigResponseDetail(ID);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("gives the Owner a null suggestion rather than failing", async () => {
    const result = await loadMpConfigResponseDetail(ID);
    if (result.status !== 200) throw new Error("expected 200");
    const owner = toOwnerResultPayload(result.body);
    expect(owner.suggestion).toBeNull();
    expect(owner.response.id).toBe(ID);
  });

  it("still 404s a Result that does not exist", async () => {
    h.responseRow = null;
    const result = await loadMpConfigResponseDetail(ID);
    expect(result.status).toBe(404);
  });
});
