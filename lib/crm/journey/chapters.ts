import type { ShownTimelineEntry } from "@/lib/crm/timeline/types";

export type JourneyTone = "good" | "steady" | "care";

export const JOURNEY_TONE_LABEL: Record<JourneyTone, string> = {
  good: "Going well",
  steady: "Steady",
  care: "Needs care",
};

export const JOURNEY_TONE_RULE: Record<JourneyTone, string> = {
  good: "an order paid, a visit, 4★ or 5★",
  steady: "everything else",
  care: "3★ or lower, a return, a refund asked for, a cancelled order, a no-show, something overdue",
};

export const GAP_DAYS = 10;
export const QUIET_GAP_DAYS = 45;

const DAY_MS = 24 * 60 * 60 * 1000;

export type JourneyChapter = {
  id: string;
  title: string;
  tone: JourneyTone;
  reason: string | null;
  from: string;
  to: string;
  entries: ShownTimelineEntry[];
  groups: string[];
  quiet: boolean;
};

const MINOR_PREFIXES = ["campaign_email.", "aftercare.", "checkup.", "review_request.", "claim_link."];

export function isMinorEntry(entry: Pick<ShownTimelineEntry, "kind">): boolean {
  return entry.kind === "order.email_sent" || MINOR_PREFIXES.some((p) => entry.kind.startsWith(p));
}

const isReview = (e: Pick<ShownTimelineEntry, "kind">) =>
  e.kind === "google_review.written" || e.kind === "review.submitted";

type Fact = { test: (e: ShownTimelineEntry) => boolean; reason: (e: ShownTimelineEntry) => string };

const CARE_FACTS: readonly Fact[] = [
  { test: (e) => isReview(e) && e.rating != null && e.rating <= 3, reason: (e) => `a ${e.rating}★ review` },
  { test: (e) => e.kind === "return.opened", reason: () => "a return" },
  { test: (e) => e.kind === "order.refund_requested", reason: () => "a refund asked for" },
  { test: (e) => e.kind === "order.cancelled", reason: () => "a cancelled order" },
  { test: (e) => e.kind === "readjustment.no_show", reason: () => "a re-adjustment no-show" },
];

const GOOD_FACTS: readonly Fact[] = [
  { test: (e) => isReview(e) && e.rating != null && e.rating >= 4, reason: (e) => `a ${e.rating}★ review` },
  { test: (e) => e.kind === "order.paid", reason: () => "an order paid" },
  { test: (e) => e.kind === "readjustment.attended", reason: () => "a re-adjustment visit" },
  { test: (e) => e.kind === "fitting.recorded", reason: () => "an in-store fitting" },
];

function firstFact(facts: readonly Fact[], entries: readonly ShownTimelineEntry[]): string | null {
  for (const fact of facts) {
    const hit = entries.find(fact.test);
    if (hit) return fact.reason(hit);
  }
  return null;
}

export function chapterTone(entries: readonly ShownTimelineEntry[]): { tone: JourneyTone; reason: string | null } {
  const care = firstFact(CARE_FACTS, entries);
  if (care) return { tone: "care", reason: care };
  const good = firstFact(GOOD_FACTS, entries);
  if (good) return { tone: "good", reason: good };
  return { tone: "steady", reason: null };
}

type Title = { kinds: readonly string[]; title: (e: ShownTimelineEntry, ctx: { firstOrder: boolean }) => string };

const stars = (e: ShownTimelineEntry) => (e.rating ? `${e.rating}★ ` : "");

const TITLES: readonly Title[] = [
  { kinds: ["google_review.written"], title: (e) => `${stars(e)}Google review` },
  { kinds: ["review.submitted"], title: (e) => `${stars(e)}shop review` },
  { kinds: ["return.opened", "return.status_changed"], title: () => "Return" },
  { kinds: ["order.refund_requested"], title: () => "Refund asked for" },
  { kinds: ["order.cancelled"], title: () => "Order cancelled" },
  { kinds: ["order.paid"], title: (_e, ctx) => (ctx.firstOrder ? "First order" : "Order") },
  { kinds: ["readjustment.attended"], title: () => "Re-adjustment visit" },
  { kinds: ["readjustment.no_show"], title: () => "Missed re-adjustment" },
  { kinds: ["fitting.recorded"], title: () => "In-store fitting" },
  { kinds: ["order.placed"], title: () => "Order placed" },
  { kinds: ["order.delivered"], title: () => "Order delivered" },
  { kinds: ["order.shipped"], title: () => "Order shipped" },
  { kinds: ["result.created", "result.build_sent", "result.balance_paid", "result.cancelled"], title: () => "Result" },
  { kinds: ["readjustment.booked"], title: () => "Re-adjustment booked" },
  { kinds: ["readjustment.cancelled"], title: () => "Re-adjustment cancelled" },
  { kinds: ["account.imported"], title: () => "Moved to this platform" },
  { kinds: ["account.claimed"], title: () => "Claimed their account" },
  { kinds: ["account.signed_up"], title: () => "Signed up" },
  { kinds: ["account.claim_bonus"], title: () => "Claim bonus" },
  { kinds: ["consent.unsubscribed"], title: () => "Unsubscribed" },
  { kinds: ["consent.subscribed"], title: () => "Subscribed" },
  { kinds: ["follow_up.added", "follow_up.done"], title: () => "Follow-up" },
  { kinds: ["note.added"], title: () => "Note" },
];

const QUIET_TITLE = "Emails and reminders";

function chapterTitle(entries: readonly ShownTimelineEntry[], quiet: boolean, ctx: { firstOrder: boolean }): string {
  if (quiet) return QUIET_TITLE;
  for (const t of TITLES) {
    const hit = entries.find((e) => t.kinds.includes(e.kind));
    if (hit) return t.title(hit, ctx);
  }
  return "Activity";
}

type Draft = {
  entries: ShownTimelineEntry[];
  records: Set<string>;
  anchor: number;
  quiet: boolean;
};

const at = (e: Pick<ShownTimelineEntry, "at">) => Date.parse(e.at);
const recordKey = (e: ShownTimelineEntry) => `${e.ref.type}:${e.ref.id}`;

function startDraft(entries: ShownTimelineEntry[], quiet: boolean): Draft {
  return {
    entries,
    records: new Set(entries.map(recordKey)),
    anchor: Math.max(...entries.filter((e) => quiet || !isMinorEntry(e)).map(at)),
    quiet,
  };
}

function join(draft: Draft, entry: ShownTimelineEntry, stretch: boolean) {
  draft.entries.push(entry);
  draft.records.add(recordKey(entry));
  if (stretch) draft.anchor = Math.max(draft.anchor, at(entry));
}

export function buildChapters(
  entries: readonly ShownTimelineEntry[],
  opts: { complete: boolean; gapDays?: number; quietGapDays?: number },
): JourneyChapter[] {
  const gap = (opts.gapDays ?? GAP_DAYS) * DAY_MS;
  const quietGap = (opts.quietGapDays ?? QUIET_GAP_DAYS) * DAY_MS;
  const sorted = entries
    .filter((e) => !Number.isNaN(at(e)))
    .slice()
    .sort((a, b) => at(a) - at(b) || a.id.localeCompare(b.id));

  const drafts: Draft[] = [];
  for (const entry of sorted) {
    const minor = isMinorEntry(entry);
    const cur = drafts[drafts.length - 1];
    if (!cur) {
      drafts.push(startDraft([entry], minor));
      continue;
    }
    const sameRecord = cur.records.has(recordKey(entry));
    if (cur.quiet) {
      if (minor) {
        if (sameRecord || at(entry) - cur.anchor <= quietGap) join(cur, entry, true);
        else drafts.push(startDraft([entry], true));
        continue;
      }
      const near = cur.entries.filter((e) => at(entry) - at(e) <= gap);
      if (near.length === cur.entries.length) {
        join(cur, entry, false);
        cur.quiet = false;
        cur.anchor = at(entry);
      } else {
        if (near.length) {
          const rest = cur.entries.filter((e) => !near.includes(e));
          drafts[drafts.length - 1] = startDraft(rest, true);
        }
        drafts.push(startDraft([...near, entry], false));
      }
      continue;
    }
    if (sameRecord || at(entry) - cur.anchor <= gap) join(cur, entry, !minor);
    else drafts.push(startDraft([entry], minor));
  }

  let paidSeen = false;
  return drafts.map((d): JourneyChapter => {
    const hasPaid = d.entries.some((e) => e.kind === "order.paid");
    const firstOrder = opts.complete && hasPaid && !paidSeen;
    if (hasPaid) paidSeen = true;
    const newestFirst = d.entries.slice().sort((a, b) => at(b) - at(a) || b.id.localeCompare(a.id));
    const oldest = newestFirst[newestFirst.length - 1]!;
    const groups: string[] = [];
    for (const e of d.entries) if (!groups.includes(e.group)) groups.push(e.group);
    return {
      id: `chapter:${oldest.id}`,
      title: chapterTitle(d.entries, d.quiet, { firstOrder }),
      ...chapterTone(d.entries),
      from: oldest.at,
      to: newestFirst[0]!.at,
      entries: newestFirst,
      groups,
      quiet: d.quiet,
    };
  });
}

export type OpenFollowUp = { id: string; title: string; dueOn: string };

export type JourneyNow = {
  tone: JourneyTone;
  reason: string | null;
  overdue: OpenFollowUp[];
  dueToday: OpenFollowUp[];
  next: OpenFollowUp | null;
};

export function journeyNow(openFollowUps: readonly OpenFollowUp[], today: string): JourneyNow {
  const byDue = openFollowUps.slice().sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id));
  const overdue = byDue.filter((f) => f.dueOn < today);
  return {
    tone: overdue.length ? "care" : "steady",
    reason: overdue.length ? (overdue.length === 1 ? "a follow-up overdue" : `${overdue.length} follow-ups overdue`) : null,
    overdue,
    dueToday: byDue.filter((f) => f.dueOn === today),
    next: byDue.find((f) => f.dueOn > today) ?? null,
  };
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

export function gapLabel(fromIso: string, toIso: string): string | null {
  const days = Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
  if (!(days >= 1)) return null;
  if (days < 14) return plural(days, "day");
  if (days < 60) return plural(Math.round(days / 7), "week");
  if (days < 700) return plural(Math.round(days / 30.44), "month");
  return plural(Math.round(days / 365.25), "year");
}

export type JourneyFilter = { key: string; label: string; groups: readonly string[] };

export const JOURNEY_FILTERS: readonly JourneyFilter[] = [
  { key: "orders", label: "Orders", groups: ["orders", "returns", "results"] },
  { key: "care", label: "Fittings and care", groups: ["fittings", "readjustments", "aftercare"] },
  { key: "conversations", label: "Conversations", groups: ["notes", "followups", "reviews"] },
  { key: "account", label: "Marketing and account", groups: ["marketing", "account"] },
];

export function visibleFilters(viewerGroups: readonly string[]): JourneyFilter[] {
  return JOURNEY_FILTERS.filter((f) => f.groups.some((g) => viewerGroups.includes(g)));
}

export function chapterEntries(chapter: JourneyChapter, filter: JourneyFilter | null): ShownTimelineEntry[] {
  return filter ? chapter.entries.filter((e) => filter.groups.includes(e.group)) : chapter.entries;
}
