/**
 * Visitor identity writers: email/Customer merge + Visit→paid Order link.
 * Deterministic only (ADR 0007) — never IP/UA/fingerprint.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const VISITOR_COOKIE = "mp_vid";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseVisitorId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return UUID_RE.test(id) ? id : null;
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

/**
 * Set-if-null for email/customer_id; never clobber a different email.
 * Returns null when nothing to write.
 */
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
      // Different person on this Visitor cookie — leave identity alone.
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

/**
 * Prefer the open Visit; else the newest Visit that is not already converted
 * to a different Order. Idempotent when already linked to this Order.
 */
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

/** Attach email and/or Customer to a Visitor (set-if-null). */
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
    // Ensure Visitor exists so checkout/sign-in can stitch before first beacon.
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

/** Set converted_order_id on the paying Visit for this Visitor. */
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
