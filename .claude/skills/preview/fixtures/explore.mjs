// The Explore page (/explore; ADR 0030, amendment of 2026-11-17): a Welcome
// bonus ladder on the S$1,000 budget that is open whenever the preview runs,
// with 9 of the first step's 25 already claimed, and four flowers on the cliff
// every day so the screenshots show them. Stand-ins for the four SQL functions
// of 20261117100000_explore_welcome_points.sql and
// 20261117144229_explore_points_budget.sql (flowers: 1 to 3 points, at most
// 500 per Customer). Every count is made up.
//
//   preview shoot /explore --signed-out          a visitor: "Claim my welcome points"
//   preview shoot /explore                       the signed-in preview user: their points
//   preview shoot "/explore?hour=21&rain=1"      the same scene at 9pm in the rain
//   preview shoot "/explore?flower=1"            back from signing up for a flower: the surprise

export default function explore({ scenario, now }) {
  const day = 86_400_000;
  const at = (days) => new Date(now.getTime() + days * day).toISOString();
  // `explore-last-few`: the first step is nearly gone, so the bar is almost empty.
  const firstClaimed = scenario === "explore-last-few" ? 23 : 9;
  const steps = [
    { step: 1, until: at(14), points: 1000, allocation: 25, claimed: firstClaimed },
    { step: 2, until: at(28), points: 800, allocation: 31, claimed: 0 },
    { step: 3, until: at(45), points: 600, allocation: 41, claimed: 0 },
    { step: 4, until: at(76), points: 500, allocation: 50, claimed: 0 },
  ];
  const FLOWER_CAP = 500;
  const flowerPoints = (tables, id) =>
    (tables.points_ledger ?? []).filter((r) => r.customer_id === id && r.kind === "explore_flower").reduce((n, r) => n + r.points, 0);
  const FLOWERS = 4;
  const picks = new Map(); // customer id -> Set of flowers picked today

  const standing = (tables) => {
    const claimedAt = (n) => (tables.points_ledger ?? []).filter((r) => r.kind === "welcome_bonus" && r.welcome_step === n).length;
    const rows = steps.map((s) => ({ ...s, claimed: s.claimed + claimedAt(s.step) }));
    const open = rows.find((s) => Date.parse(s.until) > Date.now() && s.claimed < s.allocation);
    return rows.map((s) => ({ ...s, is_open: s === open }));
  };

  return {
    tables: {
      site_settings: [
        {
          key: "points_welcome_steps",
          value: "2026-12-01T00:00+08:00|1000|25,2026-12-15T00:00+08:00|800|31,2026-12-31T23:59+08:00|600|41,2027-02-01T00:00+08:00|500|50",
        },
      ],
    },
    rpc: {
      welcome_bonus_standing: (_args, { tables }) => standing(tables),
      grant_welcome_bonus: ({ p_customer_id }, { tables }) => {
        const ledger = (tables.points_ledger ??= []);
        if (ledger.some((r) => r.customer_id === p_customer_id && r.kind === "welcome_bonus")) {
          return [{ granted: false, points: 0, step: null, reason: "already" }];
        }
        if ((tables.migrated_customers ?? []).some((m) => m.customer_id === p_customer_id)) {
          return [{ granted: false, points: 0, step: null, reason: "migrated" }];
        }
        const open = standing(tables).find((s) => s.is_open);
        if (!open) return [{ granted: false, points: 0, step: null, reason: "ended" }];
        ledger.push({
          id: `pts-welcome-${ledger.length}`,
          customer_id: p_customer_id,
          kind: "welcome_bonus",
          points: open.points,
          welcome_step: open.step,
          order_id: null,
          refund_id: null,
          note: "Welcome bonus",
          created_by_profile_id: null,
          milestone: null,
          created_at: new Date().toISOString(),
        });
        return [{ granted: true, points: open.points, step: open.step, reason: "granted" }];
      },
      explore_flowers: ({ p_customer_id }, { tables }) => [
        {
          flowers: FLOWERS,
          picked: [...(picks.get(p_customer_id) ?? [])].sort(),
          gives_points: Boolean(p_customer_id) && flowerPoints(tables, p_customer_id) < FLOWER_CAP,
        },
      ],
      pick_explore_flower: ({ p_customer_id, p_flower }, { tables }) => {
        if (!(p_flower >= 0 && p_flower < FLOWERS)) return [{ picked: false, points: 0, reason: "none" }];
        const mine = picks.get(p_customer_id) ?? new Set();
        const had = flowerPoints(tables, p_customer_id);
        if (had >= FLOWER_CAP) return [{ picked: false, points: 0, reason: "spent" }];
        if (mine.has(p_flower)) return [{ picked: false, points: 0, reason: "already" }];
        mine.add(p_flower);
        picks.set(p_customer_id, mine);
        const points = Math.min(1 + ((p_flower * 2) % 3), FLOWER_CAP - had);
        (tables.points_ledger ??= []).push({
          id: `pts-flower-${Date.now()}-${p_flower}`,
          customer_id: p_customer_id,
          kind: "explore_flower",
          points,
          welcome_step: null,
          order_id: null,
          refund_id: null,
          note: "Picked a flower on Explore",
          created_by_profile_id: null,
          milestone: null,
          created_at: new Date().toISOString(),
        });
        return [{ picked: true, points, reason: "picked" }];
      },
    },
  };
}
