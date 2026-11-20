import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  crmTelegram: vi.fn(),
  settings: [] as { key: string; value: string }[],
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({ in: async () => ({ data: table === "site_settings" ? h.settings : [], error: null }) }),
    }),
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
  h.settings = [];
});

const calls = (fn: string) => h.rpc.mock.calls.filter(([name]) => name === fn) as [string, { p_now: string }][];

const POINTS_ON = [
  { key: "points_enabled", value: "true" },
  { key: "points_launch_at", value: "2026-11-01T00:00:00Z" },
];

describe("the daily job releases earned points and stale reservations, and expires nothing", () => {
  it("chains onto results-sla in order, and vercel.json keeps two crons", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: unknown[] };
    expect(vercel.crons).toHaveLength(2);
    const sla = readFileSync(join(process.cwd(), "app/api/cron/results-sla/route.ts"), "utf8");
    const earn = sla.search(/await runPointsEarn\(admin, now\)/);
    const milestones = sla.search(/await runPointsMilestones\(admin, now\)/);
    const sweep = sla.search(/await releaseStalePointReservations\(admin, now\)/);
    expect(earn).toBeGreaterThan(0);
    expect(milestones).toBeGreaterThan(earn);
    expect(sla.slice(earn, milestones).match(/\bawait\b/g)).toHaveLength(1);
    expect(sweep).toBeGreaterThan(milestones);
    expect(sla).not.toMatch(/expir\w*points|PointsExpiry|points\/expiry/i);
  });

  it("releases as of the job's clock, once per run, and reports what it wrote", async () => {
    h.rpc.mockImplementation(async (fn: string) => ({
      data: { release_earned_points: 3, grant_due_milestone_bonuses: 5, release_stale_point_reservations: 2 }[fn] ?? null,
      error: null,
    }));
    const before = Date.now();
    const { status, body } = await tick();
    expect(status).toBe(200);
    expect(body.points).toEqual({ written: 3 });
    expect(body.pointsMilestones).toEqual({ granted: 5 });
    expect(body.pointsReservations).toEqual({ ok: true, released: 2 });
    expect(body).not.toHaveProperty("pointsExpiry");
    for (const fn of ["release_earned_points", "grant_due_milestone_bonuses", "release_stale_point_reservations"]) {
      expect(calls(fn)).toHaveLength(1);
      const [, args] = calls(fn)[0];
      expect(Date.parse(args.p_now)).toBeGreaterThanOrEqual(before - 1000);
      expect(Date.parse(args.p_now)).toBeLessThanOrEqual(Date.now());
    }
    expect(h.rpc).toHaveBeenCalledTimes(3);
  });

  it("with points on, still expires nothing and reminds nobody", async () => {
    h.settings = POINTS_ON;
    h.rpc.mockResolvedValue({ data: 0, error: null });
    await tick();
    expect(h.rpc.mock.calls.map(([fn]) => fn).sort()).toEqual([
      "grant_due_milestone_bonuses",
      "release_earned_points",
      "release_stale_point_reservations",
    ]);
  });

  it("reports a failure and still runs the jobs after it", async () => {
    h.settings = POINTS_ON;
    h.rpc.mockResolvedValue({ data: null, error: { message: "connection reset" } });
    const { status, body } = await tick();
    expect(status).toBe(200);
    expect(body.points).toEqual({ error: "Could not release earned points: connection reset" });
    expect(body.pointsMilestones).toEqual({ error: "Could not grant milestone bonuses: connection reset" });
    expect(body.pointsReservations).toEqual({ ok: false, error: "Could not release stale point reservations: connection reset" });
    expect(h.crmTelegram).toHaveBeenCalledOnce();
    expect(body.crmTelegram).toEqual({ ok: true });
  });
});
