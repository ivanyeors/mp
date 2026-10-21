import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import { decideCheckupEmail } from "@/lib/aftercare/checkup";
import { addDays } from "@/lib/readjustment/eligibility";
import { reviewFakeDb, type ReviewFakeDb } from "@/lib/aftercare/__tests__/review-request-fake-db";

/**
 * Points expiry reminders (PRD-loyalty-points slice 07; ADR 0030 rule p).
 *
 * The pure rules, then the real daily run (`runPointsExpiry`) day by day over
 * an in-memory database: the candidates come from a stand-in for
 * `points_expiry_reminder_candidates` (asserted itself in
 * supabase/tests/loyalty-points/assert-07-expiry.sql), and the email ledger
 * from the Aftercare fake, which keeps `customer_emails`' unique key and
 * `claim_customer_email` exactly as the migration defines them. Nothing is
 * sent: the transport is a fake.
 */

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

const {
  POINTS_EXPIRY_TEMPLATES,
  decidePointsReminderEmail,
  dueExpiryReminder,
  formatExpiryDate,
  minusMonths,
  planPointsExpiryReminders,
  pointsExpiryTemplate,
} = await import("../expiry");
const { runPointsExpiry } = await import("../expiry-server");

// ─── The pure rules ──────────────────────────────────────────────────────────

describe("which reminder is due", () => {
  // Expires on 15 June 2028: 3 months before is 15 March, 2 is 15 April, 1 is 15 May.
  it.each([
    ["the day before the first", "2028-03-14", null],
    ["3 months before", "2028-03-15", 3],
    ["between the first two", "2028-04-14", 3],
    ["2 months before", "2028-04-15", 2],
    ["1 month before", "2028-05-15", 1],
    ["the day before expiry", "2028-06-14", 1],
    ["the expiry day: too late for 'before then'", "2028-06-15", null],
    ["after expiry", "2028-07-01", null],
  ] as const)("%s (%s)", (_name, today, months) => {
    expect(dueExpiryReminder("2028-06-15", today)).toBe(months);
  });

  it("counts months back as Postgres does, a month-end day ending on the shorter month's last", () => {
    expect(minusMonths("2028-05-31", 3)).toBe("2028-02-29");
    expect(minusMonths("2027-05-31", 3)).toBe("2027-02-28");
    expect(minusMonths("2028-03-31", 1)).toBe("2028-02-29");
    expect(minusMonths("2028-01-15", 2)).toBe("2027-11-15");
    expect(minusMonths("2026-06-15", -24)).toBe("2028-06-15");
    // A month-end expiry: 31 May is due on 29 Feb (3 months), 31 Mar (2), 30 Apr (1).
    expect(dueExpiryReminder("2028-05-31", "2028-02-29")).toBe(3);
    expect(dueExpiryReminder("2028-05-31", "2028-03-31")).toBe(2);
    expect(dueExpiryReminder("2028-05-31", "2028-04-30")).toBe(1);
  });

  it("names the templates and writes the date as the email says it", () => {
    expect(POINTS_EXPIRY_TEMPLATES).toEqual(["points.expiry_3m", "points.expiry_2m", "points.expiry_1m"]);
    expect(pointsExpiryTemplate(1)).toBe("points.expiry_1m");
    expect(formatExpiryDate("2028-03-12")).toBe("12 March 2028");
  });
});

describe("consent is the check-up reminder's own rule", () => {
  const states = ["subscribed", "not_subscribed", "unsubscribed", null, "garbage"];
  const switches = [true, false, null];
  const addresses = ["ann@x.test", null, "not an email"];
  const allowlists = [() => true, () => false];

  it("decides exactly as decideCheckupEmail for every combination, so the two cannot drift", () => {
    let n = 0;
    for (const marketingEmail of states)
      for (const optedIn of switches)
        for (const email of addresses)
          for (const allowed of allowlists) {
            const input = { optedIn, marketingEmail, email, allowed };
            expect(decidePointsReminderEmail(input)).toEqual(decideCheckupEmail(input));
            n += 1;
          }
    expect(n).toBe(90);
  });

  it("sends only to subscribed", () => {
    const d = (marketingEmail: string | null) =>
      decidePointsReminderEmail({ optedIn: true, marketingEmail, email: "ann@x.test", allowed: () => true });
    expect(d("subscribed")).toEqual({ send: true, to: "ann@x.test" });
    expect(d("not_subscribed")).toEqual({ send: false, skip: "no_marketing_consent" });
    expect(d("unsubscribed")).toEqual({ send: false, skip: "no_marketing_consent" });
    expect(d(null)).toEqual({ send: false, skip: "no_marketing_consent" });
  });
});

describe("the plan", () => {
  const candidate = (over: Record<string, unknown> = {}) => ({
    customerId: "c1",
    email: "ann@x.test",
    firstName: "Ann",
    locale: "en-US",
    marketingEmail: "subscribed",
    aftercareEmail: true,
    available: 2130,
    clockEntityId: "clock-1",
    expiresOn: "2028-06-15",
    ...over,
  });
  const plan = (candidates: ReturnType<typeof candidate>[], ledger: Parameters<typeof planPointsExpiryReminders>[0]["ledger"] = []) =>
    planPointsExpiryReminders({ candidates, ledger, minRedeem: 500, today: "2028-05-20", allowed: () => true, maxEmailAttempts: 3 });

  it("skips, and counts why", () => {
    const out = plan([
      candidate({ customerId: "due" }),
      candidate({ customerId: "early", expiresOn: "2028-09-01" }),
      candidate({ customerId: "small", available: 499 }),
      candidate({ customerId: "exact", available: 500 }),
      candidate({ customerId: "off", aftercareEmail: false }),
      candidate({ customerId: "unsub", marketingEmail: "unsubscribed" }),
      candidate({ customerId: "sent" }),
      candidate({ customerId: "retry" }),
      candidate({ customerId: "spent" }),
    ], [
      { customer_id: "sent", template: "points.expiry_1m", entity_id: "clock-1", status: "sent", attempts: 1 },
      { customer_id: "retry", template: "points.expiry_1m", entity_id: "clock-1", status: "failed", attempts: 2 },
      { customer_id: "spent", template: "points.expiry_1m", entity_id: "clock-1", status: "failed", attempts: 3 },
      // An earlier clock's 1-month reminder does not count for this one.
      { customer_id: "due", template: "points.expiry_1m", entity_id: "clock-0", status: "sent", attempts: 1 },
    ]);
    expect(out.due.map((d) => [d.candidate.customerId, d.template])).toEqual([
      ["due", "points.expiry_1m"],
      ["exact", "points.expiry_1m"],
      ["retry", "points.expiry_1m"],
    ]);
    expect(out.skipped).toMatchObject({
      not_due: 1,
      below_minimum: 1,
      already_sent: 2,
      opted_out: 1,
      no_marketing_consent: 1,
    });
  });
});

// ─── The daily run, day by day ───────────────────────────────────────────────

const ORIGIN = "https://custom.mpillow.test";
const ENV_KEYS = ["VERCEL_ENV", "AFTERCARE_EMAIL_ALLOWLIST", "SUPPORT_EMAIL"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
beforeAll(() => {
  delete process.env.VERCEL_ENV;
  process.env.AFTERCARE_EMAIL_ALLOWLIST = "wei@x.test";
  process.env.SUPPORT_EMAIL = "support@mpillow.test";
});
afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

/** One Customer as the candidates function sees them. */
interface Sim {
  marketing_email: string;
  available: number;
  /** The clock: the entity that set it and its Singapore day. */
  clock: { id: string; on: string };
  locale?: string;
  email?: string;
}

let db: ReviewFakeDb;
let sim: Sim;
/** Each email handed to the transport, with the ledger row its send claimed. */
let sent: Array<{ day: string; template: unknown; entity: unknown; email: OutgoingEmail }>;
let failSends: Set<string>;
let today: string;

const transport: EmailTransport = {
  name: "fake",
  async send(email) {
    if (failSends.has(today)) throw new Error("smtp down");
    // dispatchCustomerEmail claims the row (pending) before it sends.
    const claimed = (db.customer_emails ?? []).filter((r) => r.status === "pending");
    expect(claimed).toHaveLength(1);
    sent.push({ day: today, template: claimed[0].template, entity: claimed[0].entity_id, email });
    return { id: `m${sent.length}` };
  },
};

/** `points_expiry_reminder_candidates` for the one simulated Customer. */
function candidatesAt(pNow: string, within: number) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date(pNow));
  const expiresOn = minusMonths(sim.clock.on, -24);
  if (!(sim.available > 0 && day <= expiresOn && minusMonths(expiresOn, within) <= day)) return [];
  return [
    {
      customer_id: "cust-wei",
      email: sim.email ?? "wei@x.test",
      first_name: "Wei Ling",
      locale: sim.locale ?? "en-US",
      marketing_email: sim.marketing_email,
      aftercare_email: true,
      available: sim.available,
      last_purchase_at: `${sim.clock.on}T04:00:00.000Z`,
      clock_entity_id: sim.clock.id,
      clock_kind: "order",
      expires_on: expiresOn,
    },
  ];
}

function admin(): SupabaseClient {
  const fake = reviewFakeDb(db);
  return {
    from: fake.from,
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "expire_due_points") return { data: 0, error: null };
      if (name === "points_expiry_reminder_candidates") {
        return { data: candidatesAt(String(args.p_now), Number(args.p_within_months)), error: null };
      }
      return fake.rpc(name, args);
    },
  } as unknown as SupabaseClient;
}

/** The job, each day from `from` to `to`, at 10:00 SGT as the cron runs. */
async function runDays(
  from: string,
  to: string,
  opts: { skip?: (day: string) => boolean; on?: Record<string, () => void>; twice?: boolean } = {},
) {
  for (let day = from; day <= to; day = addDays(day, 1)) {
    opts.on?.[day]?.();
    if (opts.skip?.(day)) continue;
    today = day;
    const now = new Date(`${day}T02:00:00.000Z`);
    for (let i = 0; i < (opts.twice ? 2 : 1); i++) {
      const report = await runPointsExpiry(admin(), { origin: ORIGIN, now, transport });
      expect(report.ok).toBe(true);
      if (!failSends.has(day)) expect(report.errors).toEqual([]);
    }
  }
}

/** What was sent: the day, the reminder, the clock and the address. */
function sends() {
  return sent.map(({ day, template, entity, email }) => [day, template, entity, email.to] as const);
}

beforeEach(() => {
  db = {
    site_settings: [
      { key: "points_enabled", value: "true" },
      { key: "points_launch_at", value: "2026-11-01T00:00:00Z" },
      { key: "points_min_redeem", value: "500" },
    ],
    customer_emails: [],
  };
  sim = { marketing_email: "subscribed", available: 2130, clock: { id: "order-1", on: "2026-06-15" } };
  sent = [];
  failSends = new Set();
  today = "";
});

// The first clock: a purchase on 15 June 2026, so the points expire on 15 June
// 2028; reminders are due 15 March, 15 April and 15 May 2028.
const SPRING = ["2028-03-01", "2028-06-20"] as const;
const TO = "wei@x.test";

type Step = { from: string; to: string; skip?: (day: string) => boolean; on?: Record<string, () => void>; twice?: boolean };
const reminders: Array<[string, () => void, Step[], Array<readonly [string, string, string, string]>]> = [
  [
    "the 3-, 2- and 1-month emails go once each per clock, a manual re-run included",
    () => {},
    [{ from: SPRING[0], to: SPRING[1], twice: true }],
    [
      ["2028-03-15", "points.expiry_3m", "order-1", TO],
      ["2028-04-15", "points.expiry_2m", "order-1", TO],
      ["2028-05-15", "points.expiry_1m", "order-1", TO],
    ],
  ],
  [
    "a purchase starts a new clock with its own three",
    () => {},
    [
      { from: SPRING[0], to: SPRING[1], on: { "2028-03-20": () => (sim.clock = { id: "order-2", on: "2028-03-20" }) } },
      { from: "2029-12-01", to: "2030-03-25" },
    ],
    [
      ["2028-03-15", "points.expiry_3m", "order-1", TO],
      ["2029-12-20", "points.expiry_3m", "order-2", TO],
      ["2030-01-20", "points.expiry_2m", "order-2", TO],
      ["2030-02-20", "points.expiry_1m", "order-2", TO],
    ],
  ],
  [
    "only the latest due reminder goes after missed days",
    () => {},
    // The job is down from 10 March to 20 April: on the 21st both the 3- and
    // the 2-month reminders are due, and only the 2-month one goes.
    [{ from: SPRING[0], to: SPRING[1], skip: (d) => d >= "2028-03-10" && d <= "2028-04-20" }],
    [
      ["2028-04-21", "points.expiry_2m", "order-1", TO],
      ["2028-05-15", "points.expiry_1m", "order-1", TO],
    ],
  ],
  [
    "a failed send is tried again the next day, while it is still the latest",
    () => {
      failSends.add("2028-03-15");
    },
    [{ from: SPRING[0], to: SPRING[1] }],
    [
      ["2028-03-16", "points.expiry_3m", "order-1", TO],
      ["2028-04-15", "points.expiry_2m", "order-1", TO],
      ["2028-05-15", "points.expiry_1m", "order-1", TO],
    ],
  ],
  ["none below points_min_redeem", () => void (sim.available = 499), [{ from: SPRING[0], to: SPRING[1] }], []],
  ["none to a Customer who is not_subscribed", () => void (sim.marketing_email = "not_subscribed"), [{ from: SPRING[0], to: SPRING[1] }], []],
  ["none to a Customer who is unsubscribed", () => void (sim.marketing_email = "unsubscribed"), [{ from: SPRING[0], to: SPRING[1] }], []],
  [
    "a customer who unsubscribes between two reminders gets no further one",
    () => {},
    [{ from: SPRING[0], to: SPRING[1], on: { "2028-04-01": () => (sim.marketing_email = "unsubscribed") } }],
    [["2028-03-15", "points.expiry_3m", "order-1", TO]],
  ],
  [
    "a balance spent below the minimum gets no further one",
    () => {},
    [{ from: SPRING[0], to: SPRING[1], on: { "2028-04-10": () => (sim.available = 130) } }],
    [["2028-03-15", "points.expiry_3m", "order-1", TO]],
  ],
  [
    "outside production, only to the allowlist",
    () => void (sim.email = "someone@else.test"),
    [{ from: SPRING[0], to: SPRING[1] }],
    [],
  ],
];

describe("the reminders, day by day", () => {
  it.each(reminders)("%s", async (_name, setup, steps, expected) => {
    setup();
    for (const step of steps) await runDays(step.from, step.to, step);
    expect(sends()).toEqual(expected);
    // Never two in one day.
    const days = sends().map(([day]) => day);
    expect(new Set(days).size).toBe(days.length);
  });

  it("says what the terms say, with the balance, the date and the three links, in the customer's locale", async () => {
    sim = { ...sim, available: 2130, clock: { id: "order-1", on: "2026-03-12" }, locale: "zh-CN" };
    await runDays("2028-02-12", "2028-02-12");
    expect(sent).toHaveLength(1);
    const { email } = sent[0];
    expect(email.to).toBe(TO);
    expect(email.replyTo).toBe("support@mpillow.test");
    expect(email.subject).toBe("Your Mpillow points expire on 12 March 2028");
    expect(email.text).toContain("You have 2,130 points (S$21.30). They expire on 12 March 2028 unless you make a purchase before then.");
    for (const url of [`${ORIGIN}/zh-CN/shop`, `${ORIGIN}/zh-CN/points`, `${ORIGIN}/zh-CN/account`]) {
      expect(email.text).toContain(url);
      expect(email.html).toContain(`href="${url}"`);
    }
    expect(email.html).toContain("You have 2,130 points (S$21.30). They expire on 12 March 2028 unless you make a purchase before then.");
    // No word of the old platform (owner, 2026-10-21), and no unsubscribe link: it is transactional.
    expect(`${email.subject}\n${email.text}\n${email.html}`).not.toMatch(/shopify|moving|\bmove\b|migrat|voucher|unsubscribe/i);
    expect(db.customer_emails).toMatchObject([{ template: "points.expiry_1m", entity_id: "order-1", status: "sent" }]);
  });

  it("sends nothing while points are off", async () => {
    db.site_settings = db.site_settings.map((r) => (r.key === "points_enabled" ? { ...r, value: "false" } : r));
    await runDays(SPRING[0], SPRING[1]);
    expect(sent).toEqual([]);
  });
});
