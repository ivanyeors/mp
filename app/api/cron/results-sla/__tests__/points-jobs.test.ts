import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Points join the daily job: earned points are released (PRD-loyalty-points
 * slice 03) and the milestone bonuses they reach granted (slice 09), stale
 * checkout reservations given back (slice 04), and balances expired and their
 * reminders sent (slice 07), chained onto results-sla with no third cron, each as of the job's own clock, and a failure reported in the
 * job's answer without stopping what follows.
 *
 * The real cron handler, runPointsEarn, runPointsMilestones and
 * runPointsExpiry; the Supabase
 * client is a fake with no Results to work on and the points settings in
 * `h.settings`, and every other chained job is a stub.
 */

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

const calls = (fn: string) => h.rpc.mock.calls.filter(([name]) => name === fn) as [string, { p_now: string; p_within_months?: number }][];

const POINTS_ON = [
  { key: "points_enabled", value: "true" },
  { key: "points_launch_at", value: "2026-11-01T00:00:00Z" },
];

describe("the daily job releases earned points and stale reservations, and expires balances", () => {
  it("chains onto results-sla in order, and vercel.json keeps two crons", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: unknown[] };
    expect(vercel.crons).toHaveLength(2);
    const sla = readFileSync(join(process.cwd(), "app/api/cron/results-sla/route.ts"), "utf8");
    const earn = sla.search(/await runPointsEarn\(admin, now\)/);
    const milestones = sla.search(/await runPointsMilestones\(admin, now\)/);
    const sweep = sla.search(/await releaseStalePointReservations\(admin, now\)/);
    const expiry = sla.search(/await runPointsExpiry\(admin, \{ origin, now \}\)/);
    expect(earn).toBeGreaterThan(0);
    // Milestone bonuses right after the release, so a bonus lands on the same
    // run as the points that reached it.
    expect(milestones).toBeGreaterThan(earn);
    expect(sla.slice(earn, milestones).match(/\bawait\b/g)).toHaveLength(1);
    expect(sweep).toBeGreaterThan(milestones);
    // The expiry runs right after the reservation sweep, so a reservation the
    // sweep gives back today is in the balance it expires.
    expect(sweep).toBeGreaterThan(earn);
    expect(expiry).toBeGreaterThan(sweep);
    // Right after: nothing else is awaited between the two.
    expect(sla.slice(sweep, expiry).match(/\bawait\b/g)).toHaveLength(1);
  });

  it("releases and expires as of the job's clock, once per run, and reports what it wrote", async () => {
    h.rpc.mockImplementation(async (fn: string) => ({
      data: { release_earned_points: 3, grant_due_milestone_bonuses: 5, release_stale_point_reservations: 2, expire_due_points: 4 }[fn] ?? null,
      error: null,
    }));
    const before = Date.now();
    const { status, body } = await tick();
    expect(status).toBe(200);
    expect(body.points).toEqual({ written: 3 });
    expect(body.pointsMilestones).toEqual({ granted: 5 });
    expect(body.pointsReservations).toEqual({ ok: true, released: 2 });
    expect(body.pointsExpiry).toMatchObject({ ok: true, enabled: false, expired: 4, candidates: 0, errors: [] });
    for (const fn of ["release_earned_points", "grant_due_milestone_bonuses", "release_stale_point_reservations", "expire_due_points"]) {
      expect(calls(fn)).toHaveLength(1);
      const [, args] = calls(fn)[0];
      expect(Date.parse(args.p_now)).toBeGreaterThanOrEqual(before - 1000);
      expect(Date.parse(args.p_now)).toBeLessThanOrEqual(Date.now());
    }
    // Points off: nobody is listed for a reminder.
    expect(h.rpc).toHaveBeenCalledTimes(4);
  });

  it("with points on, lists the reminders as of the job's clock, 3 months ahead", async () => {
    h.settings = POINTS_ON;
    h.rpc.mockImplementation(async (fn: string) => ({ data: fn === "points_expiry_reminder_candidates" ? [] : 0, error: null }));
    const { body } = await tick();
    expect(body.pointsExpiry).toMatchObject({ ok: true, enabled: true, expired: 0, candidates: 0, due: 0 });
    expect(calls("points_expiry_reminder_candidates")).toHaveLength(1);
    const [, args] = calls("points_expiry_reminder_candidates")[0];
    expect(args.p_within_months).toBe(3);
    expect(args.p_now).toBe(calls("expire_due_points")[0][1].p_now);
  });

  it("reports a failure and still runs the jobs after it", async () => {
    h.settings = POINTS_ON;
    h.rpc.mockResolvedValue({ data: null, error: { message: "connection reset" } });
    const { status, body } = await tick();
    expect(status).toBe(200);
    expect(body.points).toEqual({ error: "Could not release earned points: connection reset" });
    expect(body.pointsMilestones).toEqual({ error: "Could not grant milestone bonuses: connection reset" });
    expect(body.pointsReservations).toEqual({ ok: false, error: "Could not release stale point reservations: connection reset" });
    expect(body.pointsExpiry).toMatchObject({
      ok: false,
      expired: 0,
      errors: ["Could not expire points: connection reset", "Could not list the points expiry reminders: connection reset"],
    });
    expect(h.crmTelegram).toHaveBeenCalledOnce();
    expect(body.crmTelegram).toEqual({ ok: true });
  });
});
