// The Explore page (/explore; ADR 0030, amendment of 2026-11-17): a Welcome
// bonus ladder that is open whenever the preview runs, with 88 of the first
// step's 500 already claimed, and four flowers on the cliff every day so the
// screenshots show them. Stand-ins for the four SQL functions of
// 20261117100000_explore_welcome_points.sql. Every count is made up.
//
//   preview shoot /explore --signed-out          a visitor: "Claim my welcome points"
//   preview shoot /explore                       the signed-in preview user: their points
//   preview shoot "/explore?hour=21&rain=1"      the same scene at 9pm in the rain

export default function explore({ scenario, now }) {
  const day = 86_400_000;
  const at = (days) => new Date(now.getTime() + days * day).toISOString();
  // `explore-last-few`: the first step is nearly gone, so the bar is almost empty.
  const firstClaimed = scenario === "explore-last-few" ? 488 : 88;
  const steps = [
    { step: 1, until: at(14), points: 1000, allocation: 500, claimed: firstClaimed },
    { step: 2, until: at(28), points: 800, allocation: 500, claimed: 0 },
    { step: 3, until: at(45), points: 600, allocation: 500, claimed: 0 },
    { step: 4, until: at(76), points: 500, allocation: 500, claimed: 0 },
  ];
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
          value: "2026-12-01T00:00+08:00|1000|500,2026-12-15T00:00+08:00|800|500,2026-12-31T23:59+08:00|600|500,2027-02-01T00:00+08:00|500|500",
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
      explore_flowers: ({ p_customer_id }) => [
        { flowers: FLOWERS, picked: [...(picks.get(p_customer_id) ?? [])].sort(), gives_points: Boolean(p_customer_id) },
      ],
      pick_explore_flower: ({ p_customer_id, p_flower }, { tables }) => {
        if (!(p_flower >= 0 && p_flower < FLOWERS)) return [{ picked: false, points: 0, reason: "none" }];
        const mine = picks.get(p_customer_id) ?? new Set();
        if (mine.has(p_flower)) return [{ picked: false, points: 0, reason: "already" }];
        mine.add(p_flower);
        picks.set(p_customer_id, mine);
        const points = 1 + ((p_flower * 2) % 5);
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
