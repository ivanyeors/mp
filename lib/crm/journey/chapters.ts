import type { ShownTimelineEntry } from "@/lib/crm/timeline/types";

/**
 * The Journey tab's chapters (PRD-customer-page-journey slice 04; CONTEXT.md
 * **Customer timeline**). The timeline is one flat list, newest first, merged
 * on the server from the tables that record each fact. A **chapter** is a run
 * of its entries that belong together: an order with its delivery and its
 * emails, a review with the request that came before it.
 *
 * Pure and free of server imports: the Admin Panel's browser code builds
 * chapters from the entries the timeline route returned, so nothing is stored
 * and no source changes.
 *
 * The rules, in the order they are tried for each entry, oldest first:
 *
 * 1. An entry about a record already in the latest chapter joins it (the same
 *    Order, the same Follow-up), however long after.
 * 2. An entry within `GAP_DAYS` of the latest chapter's last *main* entry
 *    joins it.
 * 3. Otherwise it starts a chapter.
 *
 * A **minor** entry is a reminder or marketing email: something we sent, not
 * something that happened with the customer. It joins a chapter under rules 1
 * and 2 but never stretches one, and where it would start a chapter it starts
 * a **quiet** one, which gathers the minor entries that follow. A main entry
 * arriving within `GAP_DAYS` of a quiet chapter's end takes the minor entries
 * that close to it into its own chapter, so a review reads with the request
 * that prompted it.
 *
 * A chapter's **tone** is its height on the map. It is set only by the stated
 * facts in `CARE_FACTS` and `GOOD_FACTS`; anything else is steady. Needs care
 * wins when a chapter holds both.
 */

export type JourneyTone = "good" | "steady" | "care";

export const JOURNEY_TONE_LABEL: Record<JourneyTone, string> = {
  good: "Going well",
  steady: "Steady",
  care: "Needs care",
};

/** What each height is read from, as the map's legend says it. */
export const JOURNEY_TONE_RULE: Record<JourneyTone, string> = {
  good: "an order paid, a visit, 4★ or 5★",
  steady: "everything else",
  care: "3★ or lower, a return, a refund asked for, a cancelled order, a no-show, something overdue",
};

/** Days between two main entries before the later one starts a chapter. */
export const GAP_DAYS = 10;
/** Days between two reminders before the later one starts its own quiet chapter. */
export const QUIET_GAP_DAYS = 45;

const DAY_MS = 24 * 60 * 60 * 1000;

export type JourneyChapter = {
  /** Stable while its first entry stands: `chapter:<first entry id>`. */
  id: string;
  title: string;
  tone: JourneyTone;
  /** The fact that set the tone, e.g. *a 1★ review*; null for steady. */
  reason: string | null;
  /** ISO times of its first and last entry. */
  from: string;
  to: string;
  /** Newest first, as the timeline lists them. */
  entries: ShownTimelineEntry[];
  /** The kind groups it holds, for the filters. */
  groups: string[];
  /** Reminders and marketing only. */
  quiet: boolean;
};

const MINOR_PREFIXES = ["campaign_email.", "aftercare.", "checkup.", "review_request.", "claim_link."];

/** A reminder or marketing email: joins chapters, never starts or stretches a main one. */
export function isMinorEntry(entry: Pick<ShownTimelineEntry, "kind">): boolean {
  return entry.kind === "order.email_sent" || MINOR_PREFIXES.some((p) => entry.kind.startsWith(p));
}

const isReview = (e: Pick<ShownTimelineEntry, "kind">) =>
  e.kind === "google_review.written" || e.kind === "review.submitted";

type Fact = { test: (e: ShownTimelineEntry) => boolean; reason: (e: ShownTimelineEntry) => string };

/** Needs care. The first that matches names the reason. */
const CARE_FACTS: readonly Fact[] = [
  { test: (e) => isReview(e) && e.rating != null && e.rating <= 3, reason: (e) => `a ${e.rating}★ review` },
  { test: (e) => e.kind === "return.opened", reason: () => "a return" },
  { test: (e) => e.kind === "order.refund_requested", reason: () => "a refund asked for" },
  { test: (e) => e.kind === "order.cancelled", reason: () => "a cancelled order" },
  { test: (e) => e.kind === "readjustment.no_show", reason: () => "a re-adjustment no-show" },
];

/** Going well. */
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

/** The tone of a set of entries, and the fact that set it. */
export function chapterTone(entries: readonly ShownTimelineEntry[]): { tone: JourneyTone; reason: string | null } {
  const care = firstFact(CARE_FACTS, entries);
  if (care) return { tone: "care", reason: care };
  const good = firstFact(GOOD_FACTS, entries);
  if (good) return { tone: "good", reason: good };
  return { tone: "steady", reason: null };
}

type Title = { kinds: readonly string[]; title: (e: ShownTimelineEntry, ctx: { firstOrder: boolean }) => string };

const stars = (e: ShownTimelineEntry) => (e.rating ? `${e.rating}★ ` : "");

/** A chapter is named for the first of these it holds: the most telling entry. */
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
  /** Time of its last main entry; for a quiet chapter, of its last entry. */
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

/**
 * The chapters of `entries`, oldest first. `complete` says the timeline has no
 * older page: only then is the first paid order called the *First order*.
 * Entries with no readable time are left out.
 */
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
      // A main entry: it takes the reminders close to it and leaves the rest.
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

// ─── Now ─────────────────────────────────────────────────────────────────────

export type OpenFollowUp = { id: string; title: string; /** A Singapore calendar date, YYYY-MM-DD. */ dueOn: string };

export type JourneyNow = {
  tone: JourneyTone;
  reason: string | null;
  /** Open Follow-ups due before today. */
  overdue: OpenFollowUp[];
  /** Open Follow-ups due today. */
  dueToday: OpenFollowUp[];
  /** The earliest open Follow-up due after today: the map's dashed next stop. */
  next: OpenFollowUp | null;
};

/**
 * The Now chapter: what is open today. `today` is the Singapore calendar day,
 * as Follow-ups count it (lib/crm/followup-rules.ts). Overdue is the one fact
 * that makes Now need care.
 */
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

// ─── Gaps ────────────────────────────────────────────────────────────────────

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/**
 * The quiet time between two moments, in the largest unit that reads well:
 * *3 days*, *5 weeks*, *8 months*, *2 years*. Null under a day, so two
 * chapters a few hours apart show no gap.
 */
export function gapLabel(fromIso: string, toIso: string): string | null {
  const days = Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
  if (!(days >= 1)) return null;
  if (days < 14) return plural(days, "day");
  if (days < 60) return plural(Math.round(days / 7), "week");
  if (days < 700) return plural(Math.round(days / 30.44), "month");
  return plural(Math.round(days / 365.25), "year");
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export type JourneyFilter = { key: string; label: string; groups: readonly string[] };

/**
 * The Journey's filters: the timeline's eleven kind groups in four, by what
 * Staff look for. A filter shows only when the viewer may see one of its
 * groups, so the timeline's permissions carry over untouched.
 */
export const JOURNEY_FILTERS: readonly JourneyFilter[] = [
  { key: "orders", label: "Orders", groups: ["orders", "returns", "results"] },
  { key: "care", label: "Fittings and care", groups: ["fittings", "readjustments", "aftercare"] },
  { key: "conversations", label: "Conversations", groups: ["notes", "followups", "reviews"] },
  { key: "account", label: "Marketing and account", groups: ["marketing", "account"] },
];

/** The filters with at least one group the viewer may see. */
export function visibleFilters(viewerGroups: readonly string[]): JourneyFilter[] {
  return JOURNEY_FILTERS.filter((f) => f.groups.some((g) => viewerGroups.includes(g)));
}

/** A chapter's entries under a filter; all of them for no filter. */
export function chapterEntries(chapter: JourneyChapter, filter: JourneyFilter | null): ShownTimelineEntry[] {
  return filter ? chapter.entries.filter((e) => filter.groups.includes(e.group)) : chapter.entries;
}
