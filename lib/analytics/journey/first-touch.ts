/**
 * A person's first Visit: the Entry source they first arrived by.
 *
 * A Visit keeps its own Entry source, and a paid Order names the Visit that
 * paid (last touch). The first touch is read back from there: every Visitor
 * known to be the same person (one Customer, or one email, ADR 0007), and the
 * earliest Visit any of them made. Derived at read time, never stored, so a
 * Visitor merged later moves the answer with no backfill.
 *
 * Only as far back as the browser remembers: a shopper who first came on
 * another device, or in an app's browser, and gave no email there is a
 * different Visitor, and their first touch is the earliest Visit we can tie
 * to them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyVisit, CHANNEL_LABELS, type Channel, type VisitSourceFields } from "@/lib/analytics/ai-referrers";
import { visitorIdsForPerson } from "./identity";

export type EntryVisit = VisitSourceFields & {
  id: string;
  visitor_id: string;
  started_at: string;
  entry_campaign: string | null;
  landing_path: string | null;
  converted_order_id: string | null;
};

export const ENTRY_VISIT_COLUMNS =
  "id, visitor_id, started_at, entry_source, entry_medium, entry_campaign, referrer_host, entry_click_id_kind, entry_app, landing_path, converted_order_id";

export type VisitorPerson = { id: string; email: string | null; customer_id: string | null };

/**
 * Visitor id → the id of the person's group. Two Visitors are one person when
 * they share a Customer or an email, directly or through a third.
 */
export function groupVisitorsByPerson(visitors: VisitorPerson[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  };
  for (const v of visitors) {
    union(v.id, v.id);
    if (v.customer_id) union(v.id, `customer:${v.customer_id}`);
    const email = v.email?.trim().toLowerCase();
    if (email) union(v.id, `email:${email}`);
  }
  return new Map(visitors.map((v) => [v.id, find(v.id)]));
}

/** Visitor id → the earliest Visit made by anyone in that Visitor's group. */
export function firstVisitByVisitor(visitors: VisitorPerson[], visits: EntryVisit[]): Map<string, EntryVisit> {
  const group = groupVisitorsByPerson(visitors);
  const earliest = new Map<string, EntryVisit>();
  for (const visit of visits) {
    const key = group.get(visit.visitor_id) ?? visit.visitor_id;
    const held = earliest.get(key);
    if (!held || Date.parse(visit.started_at) < Date.parse(held.started_at)) earliest.set(key, visit);
  }
  const out = new Map<string, EntryVisit>();
  for (const [visitorId, key] of group) {
    const first = earliest.get(key);
    if (first) out.set(visitorId, first);
  }
  return out;
}

const CHUNK = 200;
const PAGE = 1000;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

async function visitorsWhere(
  db: SupabaseClient,
  column: "id" | "email" | "customer_id",
  values: string[],
): Promise<VisitorPerson[]> {
  const out: VisitorPerson[] = [];
  for (const part of chunks(values)) {
    const { data, error } = await db.from("analytics_visitors").select("id, email, customer_id").in(column, part);
    if (error) throw new Error(`First touch visitors: ${error.message}`);
    out.push(...((data ?? []) as VisitorPerson[]));
  }
  return out;
}

async function visitsOf(db: SupabaseClient, visitorIds: string[]): Promise<EntryVisit[]> {
  const out: EntryVisit[] = [];
  for (const part of chunks(visitorIds)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from("analytics_visits")
        .select(ENTRY_VISIT_COLUMNS)
        .in("visitor_id", part)
        .order("started_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`First touch visits: ${error.message}`);
      out.push(...((data ?? []) as unknown as EntryVisit[]));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

/**
 * The first Visit of the person behind each of these Visitors. Meant for the
 * Visitors who paid in a period (hundreds), not for every Visitor.
 */
export async function loadFirstVisits(db: SupabaseClient, visitorIds: string[]): Promise<Map<string, EntryVisit>> {
  const ids = [...new Set(visitorIds)];
  if (ids.length === 0) return new Map();

  const asked = await visitorsWhere(db, "id", ids);
  const customers = [...new Set(asked.map((v) => v.customer_id).filter((x): x is string => !!x))];
  const emails = [...new Set(asked.map((v) => v.email).filter((x): x is string => !!x))];
  const siblings = [
    ...(await visitorsWhere(db, "customer_id", customers)),
    ...(await visitorsWhere(db, "email", emails)),
  ];
  const people = [...new Map([...asked, ...siblings].map((v) => [v.id, v])).values()];
  // A Visitor row can be missing (a Visit always has one, but be safe): it is its own person.
  for (const id of ids) if (!people.some((p) => p.id === id)) people.push({ id, email: null, customer_id: null });

  const visits = await visitsOf(db, people.map((p) => p.id));
  const first = firstVisitByVisitor(people, visits);
  return new Map(ids.flatMap((id) => (first.has(id) ? [[id, first.get(id)!] as const] : [])));
}

/** A Visit's origin in words, for a person to read. */
export type EntryPoint = {
  startedAt: string;
  channel: Channel;
  channelLabel: string;
  /** Google, Instagram, ChatGPT, … or null when nothing names one. */
  platform: string | null;
  /** The raw Entry source, for a referral or a tag nothing recognises. */
  source: string | null;
  campaign: string | null;
  landingPath: string | null;
};

export function describeEntry(visit: EntryVisit): EntryPoint {
  const { channel, aiSource, platform } = classifyVisit(visit);
  return {
    startedAt: visit.started_at,
    channel,
    channelLabel: CHANNEL_LABELS[channel],
    platform: platform ?? aiSource,
    source: channel === "direct" ? null : visit.entry_source,
    campaign: visit.entry_campaign,
    landingPath: visit.landing_path,
  };
}

export type CustomerEntry = {
  /** Null when no Visit can be tied to this Customer. */
  first: EntryPoint | null;
  /** The Visit behind their first paid Order on this site, when it is not the first Visit. */
  firstPurchase: EntryPoint | null;
  visits: number;
};

/** How a Customer first reached the site, and the Visit their first Order came from. */
export async function loadCustomerEntry(
  db: SupabaseClient,
  person: { customerId: string; email?: string | null },
): Promise<CustomerEntry> {
  const visitorIds = await visitorIdsForPerson(db, person);
  if (visitorIds.length === 0) return { first: null, firstPurchase: null, visits: 0 };
  const visits = await visitsOf(db, visitorIds);
  visits.sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const first = visits[0] ?? null;
  const paid = visits.find((v) => v.converted_order_id) ?? null;
  return {
    first: first ? describeEntry(first) : null,
    firstPurchase: paid && paid.id !== first?.id ? describeEntry(paid) : null,
    visits: visits.length,
  };
}
