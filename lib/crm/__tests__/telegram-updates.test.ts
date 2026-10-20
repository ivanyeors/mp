import { describe, expect, it } from "vitest";
import {
  DEFAULT_TELEGRAM_UPDATES,
  SAMPLE_COUNTS,
  TELEGRAM_TEST_MARK,
  TELEGRAM_UPDATE_TYPES,
  applyTelegramUpdatesPatch,
  changesOnlineResultSwitch,
  isoWeekKey,
  nextLastSent,
  parseLastSent,
  parseTelegramUpdates,
  periodFor,
  previousSgtDay,
  previousSgtWeek,
  renderGoogleReviewsToMatch,
  renderNewSignUps,
  renderOnlineResultHeld,
  renderTelegramUpdateTest,
  renderWeeklySummary,
  sgtDay,
  sgtWeekday,
  telegramUpdatesPatchSchema,
} from "@/lib/crm/telegram-updates";

/**
 * Telegram updates (CRM slice 14): the settings shape, the Singapore-time
 * periods, and one renderer per type, from fixtures to the PRD's own wording.
 */

const ORIGIN = "https://mpillow.test";

/** Fixture customers: none of this may ever reach a CRM type's message. */
const FIXTURE_CUSTOMERS = [
  { first_name: "Ana", last_name: "Tan", email: "ana.tan@x.test", phone: "+6591234567" },
  { first_name: "Wei Ling", last_name: "Lim", email: "weiling@x.test", phone: "+6598765432" },
];
const PII = FIXTURE_CUSTOMERS.flatMap((c) => [c.first_name, c.last_name, c.email, c.phone]);

describe("crm_telegram_updates settings", () => {
  it("defaults every type on, the summary on Mondays", () => {
    expect(parseTelegramUpdates(undefined)).toEqual(DEFAULT_TELEGRAM_UPDATES);
    expect(parseTelegramUpdates("")).toEqual(DEFAULT_TELEGRAM_UPDATES);
    expect(DEFAULT_TELEGRAM_UPDATES).toEqual({
      online_result_held: { enabled: true },
      google_reviews_to_match: { enabled: true },
      new_sign_ups: { enabled: true },
      weekly_summary: { enabled: true, day: "mon" },
    });
  });

  it("reads a stored value", () => {
    const stored = JSON.stringify({
      online_result_held: { enabled: false },
      google_reviews_to_match: { enabled: true },
      new_sign_ups: { enabled: false },
      weekly_summary: { enabled: true, day: "fri" },
    });
    expect(parseTelegramUpdates(stored)).toEqual({
      online_result_held: { enabled: false },
      google_reviews_to_match: { enabled: true },
      new_sign_ups: { enabled: false },
      weekly_summary: { enabled: true, day: "fri" },
    });
  });

  it("treats a missing type as on, and a bad entry as its default without touching the others", () => {
    expect(parseTelegramUpdates(JSON.stringify({ new_sign_ups: { enabled: false } }))).toEqual({
      ...DEFAULT_TELEGRAM_UPDATES,
      new_sign_ups: { enabled: false },
    });
    expect(
      parseTelegramUpdates(
        JSON.stringify({ online_result_held: { enabled: "no" }, weekly_summary: { enabled: false, day: "someday" } }),
      ),
    ).toEqual({ ...DEFAULT_TELEGRAM_UPDATES, weekly_summary: { enabled: false, day: "mon" } });
    expect(parseTelegramUpdates("{not json")).toEqual(DEFAULT_TELEGRAM_UPDATES);
    expect(parseTelegramUpdates("[1,2]")).toEqual(DEFAULT_TELEGRAM_UPDATES);
  });

  it("applies a patch to the types it names only", () => {
    const next = applyTelegramUpdatesPatch(DEFAULT_TELEGRAM_UPDATES, { weekly_summary: { day: "wed" } });
    expect(next).toEqual({ ...DEFAULT_TELEGRAM_UPDATES, weekly_summary: { enabled: true, day: "wed" } });
    expect(applyTelegramUpdatesPatch(next, { new_sign_ups: { enabled: false } })).toEqual({
      ...next,
      new_sign_ups: { enabled: false },
    });
  });

  it("refuses unknown types and weekdays", () => {
    expect(telegramUpdatesPatchSchema.safeParse({ follow_ups_due: { enabled: true } }).success).toBe(false);
    expect(telegramUpdatesPatchSchema.safeParse({ weekly_summary: { day: "funday" } }).success).toBe(false);
    expect(telegramUpdatesPatchSchema.safeParse({ new_sign_ups: { enabled: false } }).success).toBe(true);
  });

  it("calls only a real change of the online Result switch a change", () => {
    const on = DEFAULT_TELEGRAM_UPDATES;
    expect(changesOnlineResultSwitch(on, { online_result_held: { enabled: false } })).toBe(true);
    expect(changesOnlineResultSwitch(on, { online_result_held: { enabled: true } })).toBe(false);
    expect(changesOnlineResultSwitch(on, { new_sign_ups: { enabled: false } })).toBe(false);
  });
});

describe("periods in Singapore time", () => {
  // 2026-10-19 is a Monday. 16:00 UTC is midnight in Singapore.
  it("takes the Singapore calendar day, across UTC midnight", () => {
    expect(sgtDay(new Date("2026-10-19T15:59:59Z"))).toBe("2026-10-19");
    expect(sgtDay(new Date("2026-10-19T16:00:00Z"))).toBe("2026-10-20");
    expect(sgtWeekday(new Date("2026-10-18T16:00:00Z"))).toBe("mon");
    expect(sgtWeekday(new Date("2026-10-18T15:59:59Z"))).toBe("sun");
  });

  it("counts New sign-ups over yesterday, midnight to midnight SGT", () => {
    // The cron at about 10:00 SGT on Tuesday 20 October.
    expect(previousSgtDay(new Date("2026-10-20T02:00:00Z"))).toEqual({
      day: "2026-10-19",
      from: "2026-10-18T16:00:00.000Z",
      to: "2026-10-19T16:00:00.000Z",
    });
  });

  it("counts the Weekly summary over the previous Monday to Sunday, keyed by its ISO week", () => {
    const week = {
      week: "2026-W42",
      from: "2026-10-11T16:00:00.000Z",
      to: "2026-10-18T16:00:00.000Z",
    };
    // Monday's run and Sunday's run (same ISO week) both summarise the week before.
    expect(previousSgtWeek(new Date("2026-10-19T02:00:00Z"))).toEqual(week);
    expect(previousSgtWeek(new Date("2026-10-25T02:00:00Z"))).toEqual(week);
    expect(previousSgtWeek(new Date("2026-10-26T02:00:00Z")).week).toBe("2026-W43");
  });

  it("numbers ISO weeks across the year boundary", () => {
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01"); // a Thursday
    expect(isoWeekKey("2025-12-29")).toBe("2026-W01");
    expect(isoWeekKey("2027-01-03")).toBe("2026-W53");
    expect(isoWeekKey("2027-01-04")).toBe("2027-W01");
  });

  it("claims a daily type for the run's day and the summary for the week it counts", () => {
    const now = new Date("2026-10-19T02:00:00Z");
    expect(periodFor("google_reviews_to_match", now)).toBe("2026-10-19");
    expect(periodFor("new_sign_ups", now)).toBe("2026-10-19");
    expect(periodFor("weekly_summary", now)).toBe("2026-W42");
  });
});

describe("crm_telegram_last_sent compare-and-set step", () => {
  it("claims a period not yet sent, keeping the other types' entries", () => {
    expect(nextLastSent(null, "weekly_summary", "2026-W42")).toEqual({
      claim: true,
      next: JSON.stringify({ weekly_summary: "2026-W42" }),
    });
    const stored = JSON.stringify({ new_sign_ups: "2026-10-19", weekly_summary: "2026-W41" });
    const step = nextLastSent(stored, "weekly_summary", "2026-W42");
    expect(step.claim && parseLastSent(step.next)).toEqual({ new_sign_ups: "2026-10-19", weekly_summary: "2026-W42" });
  });

  it("refuses the same period twice", () => {
    expect(nextLastSent(JSON.stringify({ new_sign_ups: "2026-10-19" }), "new_sign_ups", "2026-10-19")).toEqual({
      claim: false,
    });
  });

  it("reads anything unreadable as never sent", () => {
    expect(parseLastSent("nope")).toEqual({});
    expect(parseLastSent(JSON.stringify({ a: 1, b: "2026-W40" }))).toEqual({ b: "2026-W40" });
  });
});

describe("renderers: the PRD's example wording, from fixtures", () => {
  it("Google reviews to match", () => {
    expect(renderGoogleReviewsToMatch(3, ORIGIN)).toBe(
      "3 Google reviews are waiting to be matched to customers.\n" +
        "Open: https://mpillow.test/settings/customers?view=reviews",
    );
    expect(renderGoogleReviewsToMatch(1, ORIGIN).split("\n")[0]).toBe(
      "1 Google review is waiting to be matched to a customer.",
    );
  });

  it("New sign-ups", () => {
    expect(renderNewSignUps({ total: 5, migrated: 3 }, ORIGIN)).toBe(
      "5 customers signed up yesterday, 3 of them from Shopify.\nOpen: https://mpillow.test/settings/customers",
    );
    const first = (total: number, migrated: number) => renderNewSignUps({ total, migrated }, ORIGIN).split("\n")[0];
    expect(first(1, 0)).toBe("1 customer signed up yesterday.");
    expect(first(4, 0)).toBe("4 customers signed up yesterday.");
    expect(first(1, 1)).toBe("1 customer signed up yesterday, from Shopify.");
    expect(first(2, 2)).toBe("2 customers signed up yesterday, all of them from Shopify.");
  });

  it("Weekly summary, every line", () => {
    expect(renderWeeklySummary(SAMPLE_COUNTS.weeklySummary, ORIGIN)).toBe(
      "This week: 12 new customers, 7 sign-ups, 18 review requests (9 opened), 4 Google reviews linked, " +
        "11 follow-ups done, 2 overdue.\nOpen: https://mpillow.test/settings/customers",
    );
  });

  it("Weekly summary with only the sources that exist today", () => {
    expect(renderWeeklySummary({ newCustomers: 1 }, ORIGIN).split("\n")[0]).toBe("This week: 1 new customer.");
    expect(renderWeeklySummary({ newCustomers: 0, signUps: 1 }, ORIGIN).split("\n")[0]).toBe(
      "This week: 0 new customers, 1 sign-up.",
    );
  });

  it("the online Result notice is today's text, Paired build lines included", () => {
    const text = renderOnlineResultHeld({
      label: "Size×tier (suggested): M × premium",
      email: "ana.tan@x.test",
      serviceLines: [{ label: "Measurement service (Premium)", msrp: 50 }],
      currency: "SGD",
      total: 250,
      cardTaken: true,
      paired: { length: "medium", total: 200, platformUrl: `${ORIGIN}/settings/results/r2` },
      platformUrl: `${ORIGIN}/settings/results/r1`,
    });
    expect(text).toBe(
      [
        "💤 Held Result (online purchase) — review needed",
        "Size×tier (suggested): M × premium",
        "Email: ana.tan@x.test",
        "Measurement service (Premium): SGD 50.00",
        "Authorized: SGD 250.00",
        "",
        "➕ Paired Mbolster medium — same hold, ships with this pillow",
        "Quoted: SGD 200.00",
        "Platform: https://mpillow.test/settings/results/r2",
        "",
        "Platform: https://mpillow.test/settings/results/r1",
      ].join("\n"),
    );
    expect(
      renderOnlineResultHeld({
        label: "Length (suggested): short",
        email: "a@x.test",
        serviceLines: [],
        currency: "SGD",
        total: 99.5,
        cardTaken: false,
        paired: null,
        platformUrl: `${ORIGIN}/settings/results/r1`,
      }),
    ).toBe(
      "💤 Held Result (online purchase) — review needed\nLength (suggested): short\nEmail: a@x.test\n" +
        "No card taken — quoted SGD 99.50\n\nPlatform: https://mpillow.test/settings/results/r1",
    );
  });
});

describe("no customer data in the CRM's own types", () => {
  // The CRM renderers take counts and an origin, so a customer cannot be passed
  // in. Render every shape and scan anyway, so a renderer that grows a
  // name parameter later fails here.
  const outputs = [
    renderGoogleReviewsToMatch(0, ORIGIN),
    renderGoogleReviewsToMatch(1, ORIGIN),
    renderGoogleReviewsToMatch(27, ORIGIN),
    renderNewSignUps({ total: 2, migrated: 1 }, ORIGIN),
    renderNewSignUps({ total: 1, migrated: 1 }, ORIGIN),
    renderWeeklySummary(SAMPLE_COUNTS.weeklySummary, ORIGIN),
    renderWeeklySummary({ newCustomers: FIXTURE_CUSTOMERS.length }, ORIGIN),
    ...(["google_reviews_to_match", "new_sign_ups", "weekly_summary"] as const).map((t) =>
      renderTelegramUpdateTest(t, ORIGIN),
    ),
  ];

  it.each(outputs.map((o) => [o.split("\n")[0], o]))("%s", (_label, text) => {
    for (const fact of PII) expect(text, fact).not.toContain(fact);
    expect(text).not.toMatch(/@/);
    // Counts and an Admin Panel link, nothing else.
    expect(text.split("\n").at(-1)).toMatch(/^Open: https:\/\/mpillow\.test\/settings\/customers/);
  });
});

describe("Send test messages", () => {
  it.each(TELEGRAM_UPDATE_TYPES)("%s is marked TEST and carries no real customer", (type) => {
    const text = renderTelegramUpdateTest(type, ORIGIN);
    expect(text.split("\n")[0]).toBe(TELEGRAM_TEST_MARK);
    expect(text).toContain("TEST");
    for (const fact of PII) expect(text, fact).not.toContain(fact);
  });

  it("the online Result sample is a made-up build for test@example.com, with a paired Mbolster", () => {
    const text = renderTelegramUpdateTest("online_result_held", ORIGIN);
    expect(text).toContain("Email: test@example.com");
    expect(text).toContain("➕ Paired Mbolster medium — same hold, ships with this pillow");
    expect(text).toContain("Quoted: SGD 163.50");
    // Two Platform lines, and neither opens a Result: there is no real one.
    expect(text.match(/^Platform: https:\/\/mpillow\.test\/settings\/results$/gm)).toHaveLength(2);
  });
});
