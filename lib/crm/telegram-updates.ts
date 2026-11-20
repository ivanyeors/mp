import { z } from "zod";

export const CRM_TELEGRAM_UPDATES_KEY = "crm_telegram_updates";

export const CRM_TELEGRAM_LAST_SENT_KEY = "crm_telegram_last_sent";

export const TELEGRAM_UPDATE_TYPES = [
  "online_result_held",
  "google_reviews_to_match",
  "new_sign_ups",
  "weekly_summary",
] as const;
export type TelegramUpdateType = (typeof TELEGRAM_UPDATE_TYPES)[number];

export const SCHEDULED_TELEGRAM_UPDATE_TYPES = [
  "google_reviews_to_match",
  "new_sign_ups",
  "weekly_summary",
] as const satisfies readonly TelegramUpdateType[];
export type ScheduledTelegramUpdateType = (typeof SCHEDULED_TELEGRAM_UPDATE_TYPES)[number];

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const typeSwitch = z.object({ enabled: z.boolean() });
const weekday = z.enum(WEEKDAYS);

export const telegramUpdatesSchema = z.object({
  online_result_held: typeSwitch,
  google_reviews_to_match: typeSwitch,
  new_sign_ups: typeSwitch,
  weekly_summary: typeSwitch.extend({ day: weekday }),
});
export type TelegramUpdatesSettings = z.infer<typeof telegramUpdatesSchema>;

export const DEFAULT_TELEGRAM_UPDATES: TelegramUpdatesSettings = {
  online_result_held: { enabled: true },
  google_reviews_to_match: { enabled: true },
  new_sign_ups: { enabled: true },
  weekly_summary: { enabled: true, day: "mon" },
};

export function parseTelegramUpdates(stored: string | null | undefined): TelegramUpdatesSettings {
  let raw: unknown = null;
  try {
    raw = stored ? JSON.parse(stored) : null;
  } catch {
    raw = null;
  }
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const enabled = (type: TelegramUpdateType) => {
    const parsed = typeSwitch.safeParse(obj[type]);
    return parsed.success ? parsed.data.enabled : DEFAULT_TELEGRAM_UPDATES[type].enabled;
  };
  const weekly = obj.weekly_summary as { day?: unknown } | undefined;
  const day = weekday.safeParse(weekly?.day);
  return {
    online_result_held: { enabled: enabled("online_result_held") },
    google_reviews_to_match: { enabled: enabled("google_reviews_to_match") },
    new_sign_ups: { enabled: enabled("new_sign_ups") },
    weekly_summary: {
      enabled: enabled("weekly_summary"),
      day: day.success ? day.data : DEFAULT_TELEGRAM_UPDATES.weekly_summary.day,
    },
  };
}

export const telegramUpdatesPatchSchema = z
  .object({
    online_result_held: typeSwitch.optional(),
    google_reviews_to_match: typeSwitch.optional(),
    new_sign_ups: typeSwitch.optional(),
    weekly_summary: z
      .object({ enabled: z.boolean().optional(), day: weekday.optional() })
      .strict()
      .optional(),
  })
  .strict();
export type TelegramUpdatesPatch = z.infer<typeof telegramUpdatesPatchSchema>;

export function applyTelegramUpdatesPatch(
  current: TelegramUpdatesSettings,
  patch: TelegramUpdatesPatch,
): TelegramUpdatesSettings {
  return telegramUpdatesSchema.parse({
    online_result_held: patch.online_result_held ?? current.online_result_held,
    google_reviews_to_match: patch.google_reviews_to_match ?? current.google_reviews_to_match,
    new_sign_ups: patch.new_sign_ups ?? current.new_sign_ups,
    weekly_summary: { ...current.weekly_summary, ...stripUndefined(patch.weekly_summary ?? {}) },
  });
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function changesOnlineResultSwitch(
  current: TelegramUpdatesSettings,
  patch: TelegramUpdatesPatch,
): boolean {
  return (
    patch.online_result_held !== undefined &&
    patch.online_result_held.enabled !== current.online_result_held.enabled
  );
}

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function sgtDay(at: Date): string {
  return new Date(at.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 10);
}

function sgtMidnight(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - SGT_OFFSET_MS);
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function sgtWeekday(at: Date): Weekday {
  const dow = new Date(at.getTime() + SGT_OFFSET_MS).getUTCDay();
  return WEEKDAYS[(dow + 6) % 7];
}

export function isoWeekKey(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const isoDow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - isoDow);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type CountWindow = { from: string; to: string };

export function previousSgtDay(now: Date): CountWindow & { day: string } {
  const today = sgtDay(now);
  const day = addDays(today, -1);
  return { day, from: sgtMidnight(day).toISOString(), to: sgtMidnight(today).toISOString() };
}

export function previousSgtWeek(now: Date): CountWindow & { week: string } {
  const today = sgtDay(now);
  const thisMonday = addDays(today, -WEEKDAYS.indexOf(sgtWeekday(now)));
  const lastMonday = addDays(thisMonday, -7);
  return {
    week: isoWeekKey(lastMonday),
    from: sgtMidnight(lastMonday).toISOString(),
    to: sgtMidnight(thisMonday).toISOString(),
  };
}

export function periodFor(type: ScheduledTelegramUpdateType, now: Date): string {
  return type === "weekly_summary" ? previousSgtWeek(now).week : sgtDay(now);
}

export function parseLastSent(stored: string | null | undefined): Record<string, string> {
  try {
    const raw: unknown = stored ? JSON.parse(stored) : null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function nextLastSent(
  stored: string | null | undefined,
  type: ScheduledTelegramUpdateType,
  period: string,
): { claim: false } | { claim: true; next: string } {
  const sent = parseLastSent(stored);
  if (sent[type] === period) return { claim: false };
  return { claim: true, next: JSON.stringify({ ...sent, [type]: period }) };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const TELEGRAM_UPDATE_LINKS = {
  google_reviews_to_match: "/settings/customers?view=reviews",
  new_sign_ups: "/settings/customers",
  weekly_summary: "/settings/customers",
} as const satisfies Record<ScheduledTelegramUpdateType, string>;

function withLink(sentence: string, origin: string, path: string): string {
  return `${sentence}\nOpen: ${origin}${path}`;
}

export function renderGoogleReviewsToMatch(count: number, origin: string): string {
  const sentence =
    count === 1
      ? "1 Google review is waiting to be matched to a customer."
      : `${count} Google reviews are waiting to be matched to customers.`;
  return withLink(sentence, origin, TELEGRAM_UPDATE_LINKS.google_reviews_to_match);
}

export type SignUpCounts = {
  total: number;
  migrated: number;
};

export function renderNewSignUps(counts: SignUpCounts, origin: string): string {
  const { total, migrated } = counts;
  const head = `${plural(total, "customer")} signed up yesterday`;
  const shopify =
    migrated <= 0
      ? ""
      : migrated >= total
        ? total === 1
          ? ", from Shopify"
          : ", all of them from Shopify"
        : `, ${migrated} of them from Shopify`;
  return withLink(`${head}${shopify}.`, origin, TELEGRAM_UPDATE_LINKS.new_sign_ups);
}

export type WeeklySummaryCounts = {
  newCustomers: number;
  signUps?: number;
  reviewRequests?: { sent: number; opened: number };
  googleReviewsLinked?: number;
  followUps?: { done: number; overdue: number };
};

export function renderWeeklySummary(counts: WeeklySummaryCounts, origin: string): string {
  const parts = [plural(counts.newCustomers, "new customer")];
  if (counts.signUps !== undefined) parts.push(plural(counts.signUps, "sign-up"));
  if (counts.reviewRequests) {
    parts.push(`${plural(counts.reviewRequests.sent, "review request")} (${counts.reviewRequests.opened} opened)`);
  }
  if (counts.googleReviewsLinked !== undefined) {
    parts.push(`${plural(counts.googleReviewsLinked, "Google review")} linked`);
  }
  if (counts.followUps) {
    parts.push(`${plural(counts.followUps.done, "follow-up")} done, ${counts.followUps.overdue} overdue`);
  }
  return withLink(`This week: ${parts.join(", ")}.`, origin, TELEGRAM_UPDATE_LINKS.weekly_summary);
}

export type OnlineResultHeldNotice = {
  label: string;
  email: string;
  serviceLines: ReadonlyArray<{ label: string; msrp: number }>;
  currency: string;
  total: number;
  cardTaken: boolean;
  paired: { length: string; total: number; platformUrl: string } | null;
  platformUrl: string;
  discount?: { code: string; amount: number; freeShipping: boolean } | null;
};

export function renderOnlineResultHeld(n: OnlineResultHeldNotice): string {
  return [
    "💤 Held Result (online purchase) — review needed",
    n.label,
    `Email: ${n.email}`,
    ...n.serviceLines.map((l) => `${l.label}: ${n.currency} ${l.msrp.toFixed(2)}`),
    ...(n.discount
      ? [
          n.discount.freeShipping && n.discount.amount <= 0
            ? `Discount code ${n.discount.code}: free shipping`
            : `Discount code ${n.discount.code}: −${n.currency} ${n.discount.amount.toFixed(2)}`,
        ]
      : []),
    n.cardTaken
      ? `Authorized: ${n.currency} ${n.total.toFixed(2)}`
      : `No card taken — quoted ${n.currency} ${n.total.toFixed(2)}`,
    ...(n.paired
      ? [
          "",
          `➕ Paired Mbolster ${n.paired.length} — same hold, ships with this pillow`,
          `Quoted: ${n.currency} ${n.paired.total.toFixed(2)}`,
          `Platform: ${n.paired.platformUrl}`,
        ]
      : []),
    "",
    `Platform: ${n.platformUrl}`,
  ].join("\n");
}

export const TELEGRAM_TEST_MARK = "🧪 TEST — sample numbers, not real";

export const SAMPLE_COUNTS = {
  googleReviewsToMatch: 3,
  newSignUps: { total: 5, migrated: 3 } satisfies SignUpCounts,
  weeklySummary: {
    newCustomers: 12,
    signUps: 7,
    reviewRequests: { sent: 18, opened: 9 },
    googleReviewsLinked: 4,
    followUps: { done: 11, overdue: 2 },
  } satisfies WeeklySummaryCounts,
};

export function sampleOnlineResultHeld(origin: string): OnlineResultHeldNotice {
  return {
    label: "Size×tier (suggested): M × premium",
    email: "test@example.com",
    serviceLines: [{ label: "Measurement service (Premium)", msrp: 50 }],
    currency: "SGD",
    total: 387,
    cardTaken: true,
    paired: { length: "medium", total: 163.5, platformUrl: `${origin}/settings/results` },
    platformUrl: `${origin}/settings/results`,
  };
}

export function renderTelegramUpdateTest(type: TelegramUpdateType, origin: string): string {
  const body =
    type === "online_result_held"
      ? renderOnlineResultHeld(sampleOnlineResultHeld(origin))
      : type === "google_reviews_to_match"
        ? renderGoogleReviewsToMatch(SAMPLE_COUNTS.googleReviewsToMatch, origin)
        : type === "new_sign_ups"
          ? renderNewSignUps(SAMPLE_COUNTS.newSignUps, origin)
          : renderWeeklySummary(SAMPLE_COUNTS.weeklySummary, origin);
  return `${TELEGRAM_TEST_MARK}\n${body}`;
}

export const TELEGRAM_UPDATE_DESCRIPTIONS: Record<
  TelegramUpdateType,
  { label: string; when: string; example: string }
> = {
  online_result_held: {
    label: "New online Result to review",
    when: "Instant, on every online hold",
    example:
      "💤 Held Result (online purchase) — review needed: the build, the customer's email, the amount, and the link to the Result.",
  },
  google_reviews_to_match: {
    label: "Google reviews to match",
    when: "Daily, only when there are any",
    example: firstLine(renderGoogleReviewsToMatch(SAMPLE_COUNTS.googleReviewsToMatch, "")),
  },
  new_sign_ups: {
    label: "New sign-ups",
    when: "Daily, only when there are any",
    example: firstLine(renderNewSignUps(SAMPLE_COUNTS.newSignUps, "")),
  },
  weekly_summary: {
    label: "Weekly summary",
    when: "Weekly, for the previous Monday to Sunday",
    example: firstLine(renderWeeklySummary(SAMPLE_COUNTS.weeklySummary, "")),
  },
};

function firstLine(text: string): string {
  return text.split("\n")[0];
}
