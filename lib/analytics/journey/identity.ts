import type { SupabaseClient } from "@supabase/supabase-js";

export const VISITOR_COOKIE = "mp_vid";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseVisitorId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return UUID_RE.test(id) ? id : null;
}

export function readVisitorCookie(req: { headers: { get(name: string): string | null } }): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([^;]*)`));
  if (!match) return null;
  try {
    return parseVisitorId(decodeURIComponent(match[1]!));
  } catch {
    return null;
  }
}

export function normalizeVisitorEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export type VisitorIdentityRow = {
  email: string | null;
  customer_id: string | null;
  merged_at: string | null;
};

export type VisitorMergePatch = {
  email?: string | null;
  customer_id?: string | null;
  merged_at?: string;
};

export function planVisitorMerge(
  existing: VisitorIdentityRow,
  input: { email?: string | null; customerId?: string | null },
  nowIso: string = new Date().toISOString(),
): VisitorMergePatch | null {
  const email = normalizeVisitorEmail(input.email);
  const customerId =
    typeof input.customerId === "string" && UUID_RE.test(input.customerId)
      ? input.customerId
      : null;

  const patch: VisitorMergePatch = {};

  if (email) {
    if (!existing.email) patch.email = email;
    else if (existing.email !== email) {
      return null;
    }
  }

  if (customerId && !existing.customer_id) {
    patch.customer_id = customerId;
  }

  if (!patch.email && !patch.customer_id) return null;

  if (!existing.merged_at) patch.merged_at = nowIso;
  return patch;
}

export type VisitConversionCandidate = {
  id: string;
  ended_at: string | null;
  started_at: string;
  converted_order_id: string | null;
};

export function pickVisitForConversion(
  visits: VisitConversionCandidate[],
  orderId: string,
): { visitId: string; alreadyLinked: boolean } | null {
  if (!orderId || !UUID_RE.test(orderId)) return null;

  const already = visits.find((v) => v.converted_order_id === orderId);
  if (already) return { visitId: already.id, alreadyLinked: true };

  const open = visits
    .filter((v) => !v.ended_at && !v.converted_order_id)
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  if (open[0]) return { visitId: open[0].id, alreadyLinked: false };

  const recent = visits
    .filter((v) => !v.converted_order_id)
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  if (recent[0]) return { visitId: recent[0].id, alreadyLinked: false };

  return null;
}

export async function mergeVisitorIdentity(
  db: SupabaseClient,
  opts: {
    visitorId: string;
    email?: string | null;
    customerId?: string | null;
    nowIso?: string;
  },
): Promise<{ ok: true; merged: boolean } | { ok: false; error: string }> {
  const visitorId = parseVisitorId(opts.visitorId);
  if (!visitorId) return { ok: false, error: "invalid visitorId" };

  const { data: row, error: lookErr } = await db
    .from("analytics_visitors")
    .select("email, customer_id, merged_at")
    .eq("id", visitorId)
    .maybeSingle();
  if (lookErr) return { ok: false, error: lookErr.message };
  if (!row) {
    const { error: insErr } = await db.from("analytics_visitors").upsert(
      { id: visitorId },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (insErr) return { ok: false, error: insErr.message };
  }

  const existing: VisitorIdentityRow = {
    email: (row?.email as string | null) ?? null,
    customer_id: (row?.customer_id as string | null) ?? null,
    merged_at: (row?.merged_at as string | null) ?? null,
  };
  const patch = planVisitorMerge(existing, opts, opts.nowIso);
  if (!patch) return { ok: true, merged: false };

  const { error: uErr } = await db
    .from("analytics_visitors")
    .update(patch)
    .eq("id", visitorId);
  if (uErr) return { ok: false, error: uErr.message };
  return { ok: true, merged: true };
}

export async function linkVisitToPaidOrder(
  db: SupabaseClient,
  opts: { visitorId: string; orderId: string },
): Promise<
  | { ok: true; linked: boolean; visitId: string | null }
  | { ok: false; error: string }
> {
  const visitorId = parseVisitorId(opts.visitorId);
  const orderId = parseVisitorId(opts.orderId);
  if (!visitorId) return { ok: false, error: "invalid visitorId" };
  if (!orderId) return { ok: false, error: "invalid orderId" };

  const { data: visits, error: lookErr } = await db
    .from("analytics_visits")
    .select("id, ended_at, started_at, converted_order_id")
    .eq("visitor_id", visitorId)
    .order("started_at", { ascending: false })
    .limit(20);
  if (lookErr) return { ok: false, error: lookErr.message };

  const pick = pickVisitForConversion(
    (visits ?? []) as VisitConversionCandidate[],
    orderId,
  );
  if (!pick) return { ok: true, linked: false, visitId: null };
  if (pick.alreadyLinked) return { ok: true, linked: true, visitId: pick.visitId };

  const { error: uErr } = await db
    .from("analytics_visits")
    .update({ converted_order_id: orderId })
    .eq("id", pick.visitId)
    .is("converted_order_id", null);
  if (uErr) return { ok: false, error: uErr.message };
  return { ok: true, linked: true, visitId: pick.visitId };
}

export async function visitorIdsForPerson(
  db: SupabaseClient,
  person: { customerId?: string | null; email?: string | null },
): Promise<string[]> {
  const customerId = parseVisitorId(person.customerId);
  const email = normalizeVisitorEmail(person.email);
  const ids = new Set<string>();
  if (customerId) {
    const { data, error } = await db.from("analytics_visitors").select("id").eq("customer_id", customerId).limit(50);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) ids.add(row.id as string);
  }
  if (email) {
    const { data, error } = await db.from("analytics_visitors").select("id").eq("email", email).limit(50);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) ids.add(row.id as string);
  }
  return [...ids];
}

export async function linkPaidOrderToPerson(
  db: SupabaseClient,
  opts: { orderId: string; customerId?: string | null; email?: string | null },
): Promise<{ ok: true; linked: boolean; visitId: string | null } | { ok: false; error: string }> {
  const orderId = parseVisitorId(opts.orderId);
  if (!orderId) return { ok: false, error: "invalid orderId" };

  let visitorIds: string[];
  try {
    visitorIds = await visitorIdsForPerson(db, opts);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "visitor lookup failed" };
  }
  if (visitorIds.length === 0) return { ok: true, linked: false, visitId: null };

  const { data: visits, error: lookErr } = await db
    .from("analytics_visits")
    .select("id, ended_at, started_at, converted_order_id")
    .in("visitor_id", visitorIds)
    .order("started_at", { ascending: false })
    .limit(50);
  if (lookErr) return { ok: false, error: lookErr.message };

  const pick = pickVisitForConversion((visits ?? []) as VisitConversionCandidate[], orderId);
  if (!pick) return { ok: true, linked: false, visitId: null };
  if (pick.alreadyLinked) return { ok: true, linked: true, visitId: pick.visitId };

  const { error: uErr } = await db
    .from("analytics_visits")
    .update({ converted_order_id: orderId })
    .eq("id", pick.visitId)
    .is("converted_order_id", null);
  if (uErr) return { ok: false, error: uErr.message };
  return { ok: true, linked: true, visitId: pick.visitId };
}

export async function stitchVisitor(
  db: SupabaseClient,
  req: { headers: { get(name: string): string | null } },
  person: { email?: string | null; customerId?: string | null },
): Promise<void> {
  try {
    const visitorId = readVisitorCookie(req);
    if (!visitorId) return;
    const merged = await mergeVisitorIdentity(db, { visitorId, ...person });
    if (!merged.ok) console.error("[journey] Visitor merge failed:", merged.error);
  } catch (e) {
    console.error("[journey] Visitor merge failed:", e);
  }
}

export async function recordPaidOrderVisit(
  db: SupabaseClient,
  opts: { orderId: string; customerId?: string | null; email?: string | null },
): Promise<void> {
  try {
    const linked = await linkPaidOrderToPerson(db, opts);
    if (!linked.ok) console.error(`[journey] Order ${opts.orderId} was not linked to a Visit:`, linked.error);
  } catch (e) {
    console.error(`[journey] Order ${opts.orderId} was not linked to a Visit:`, e);
  }
}
