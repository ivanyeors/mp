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
  for (const id of ids) if (!people.some((p) => p.id === id)) people.push({ id, email: null, customer_id: null });

  const visits = await visitsOf(db, people.map((p) => p.id));
  const first = firstVisitByVisitor(people, visits);
  return new Map(ids.flatMap((id) => (first.has(id) ? [[id, first.get(id)!] as const] : [])));
}

export type EntryPoint = {
  startedAt: string;
  channel: Channel;
  channelLabel: string;
  platform: string | null;
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
  first: EntryPoint | null;
  firstPurchase: EntryPoint | null;
  visits: number;
};

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
