import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Points join the daily job: earned points are released (PRD-loyalty-points
 * slice 03) and stale checkout reservations given back (slice 04), chained
 * onto results-sla with no third cron, each as of the job's own clock, and a
 * failure reported in the job's answer without stopping what follows.
 *
 * The real cron handler and the real runPointsEarn; the Supabase client is a
 * fake with no Results to work on, and every other chained job is a stub.
 */

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  crmTelegram: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }),
    rpc: h.rpc,
  }),
}));
vi.mock("@/lib/site-settings", () => ({ getSiteSettings: async () => ({}) }));
vi.mock("@/lib/shopify/order-mirror-catchup", () => ({ runShopifyOrderMirrorCatchup: async () => ({ ok: true }) }));
vi.mock("@/lib/analytics/journey/ga-sync", () => ({ runGaSync: async () => ({ ok: true }) }));
vi.mock("@/lib/seo-metrics/ingest-gsc", () => ({ runGscIngestFromEnv: async () => ({ ok: true }) }));
vi.mock("@/lib/configurator/pre-order-restock", () => ({ runPreOrderRestockNotices: async () => ({ ok: true }) }));
vi.mock("@/lib/reviews/google-sync", () => ({ syncGoogleReviews: async () => ({ ok: true }) }));
vi.mock("@/lib/aftercare/job", () => ({ runAftercareMessages: async () => ({ ok: true }) }));
vi.mock("@/lib/crm/telegram-updates-server", () => ({ runCrmTelegramUpdates: h.crmTelegram }));

const { GET } = await import("@/app/api/cron/results-sla/route");

const tick = async () => {
  const res = await GET(new Request("https://x.test/api/cron/results-sla"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CRON_SECRET;
  h.crmTelegram.mockResolvedValue({ ok: true });
});

const calls = (fn: string) => h.rpc.mock.calls.filter(([name]) => name === fn) as [string, { p_now: string }][];

describe("the daily job releases earned points and stale reservations", () => {
  it("chains onto results-sla, and vercel.json keeps two crons", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: unknown[] };
    expect(vercel.crons).toHaveLength(2);
    const sla = readFileSync(join(process.cwd(), "app/api/cron/results-sla/route.ts"), "utf8");
    expect(sla).toMatch(/await runPointsEarn\(admin, now\)/);
    expect(sla).toMatch(/await releaseStalePointReservations\(admin, now\)/);
  });

  it("releases as of the job's clock, once per run, and reports what it wrote", async () => {
    h.rpc.mockImplementation(async (fn: string) => ({ data: fn === "release_earned_points" ? 3 : 2, error: null }));
    const before = Date.now();
    const { status, body } = await tick();
    expect(status).toBe(200);
    expect(body.points).toEqual({ written: 3 });
    expect(body.pointsReservations).toEqual({ ok: true, released: 2 });
    for (const fn of ["release_earned_points", "release_stale_point_reservations"]) {
      expect(calls(fn)).toHaveLength(1);
      const [, args] = calls(fn)[0];
      expect(Date.parse(args.p_now)).toBeGreaterThanOrEqual(before - 1000);
      expect(Date.parse(args.p_now)).toBeLessThanOrEqual(Date.now());
    }
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("reports a failure and still runs the jobs after it", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "connection reset" } });
    const { status, body } = await tick();
    expect(status).toBe(200);
    expect(body.points).toEqual({ error: "Could not release earned points: connection reset" });
    expect(body.pointsReservations).toEqual({ ok: false, error: "Could not release stale point reservations: connection reset" });
    expect(h.crmTelegram).toHaveBeenCalledOnce();
    expect(body.crmTelegram).toEqual({ ok: true });
  });
});
