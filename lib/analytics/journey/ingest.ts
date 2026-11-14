import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCountryCode, UNKNOWN_COUNTRY } from "./country";
import { resolveEntrySource, type EntrySourceInput } from "./entry-source";
import { isEntryApp } from "./in-app";
import { isValidReferralCodeFormat } from "@/lib/referrals/attribution";
import { stampVisitorRef } from "@/lib/referrals";
import { normalizeGaClientId } from "./ga-sync";
import {
  resolveExplicitDropOff,
  resolveInactivityDropOff,
  type LifecycleEvent,
} from "./lifecycle";
import { isAdminJourneyPath, normalizeJourneyPath } from "./paths";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type IngestEventInput = {
  type: "page_view" | "section_view" | "heartbeat";
  path: string;
  sectionId?: string | null;
  occurredAt?: string | null;
};

export type IngestBody = {
  visitorId: string;
  visitId: string;
  events: IngestEventInput[];
  /** GA client_id / user_pseudo_id — set on Visitor only if currently null. */
  gaClientId?: string | null;
  /** Only applied on Visit INSERT (frozen Entry source). */
  entry?: EntrySourceInput | null;
  /** ISO country (or Unknown) — set on Visit INSERT only; from server headers. */
  country?: string | null;
  /**
   * The in-app browser the request came from (`in-app.ts`), from the server's
   * own read of the User-Agent. Set on Visit INSERT only.
   */
  entryApp?: string | null;
  /** Close a prior Visit (pagehide or rotated after inactivity). */
  closeVisitId?: string | null;
  closeReason?: "pagehide" | "inactivity" | null;
};

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function parseIngestBody(raw: unknown):
  | { ok: true; body: IngestBody }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid JSON" };
  const o = raw as Record<string, unknown>;
  if (!isUuid(o.visitorId)) return { ok: false, error: "visitorId required" };
  if (!isUuid(o.visitId)) return { ok: false, error: "visitId required" };
  if (!Array.isArray(o.events)) return { ok: false, error: "events required" };
  if (o.events.length > 50) return { ok: false, error: "too many events" };
  // pagehide may send closeVisitId with empty events
  if (o.events.length === 0 && !isUuid(o.closeVisitId)) {
    return { ok: false, error: "events required" };
  }

  const events: IngestEventInput[] = [];
  for (const item of o.events) {
    if (!item || typeof item !== "object") return { ok: false, error: "bad event" };
    const e = item as Record<string, unknown>;
    if (e.type !== "page_view" && e.type !== "section_view" && e.type !== "heartbeat") {
      return { ok: false, error: "bad event type" };
    }
    if (typeof e.path !== "string") return { ok: false, error: "path required" };
    if (isAdminJourneyPath(e.path)) return { ok: false, error: "admin path rejected" };
    const path = normalizeJourneyPath(e.path);
    if (!path) return { ok: false, error: "invalid path" };
    events.push({
      type: e.type,
      path,
      sectionId: typeof e.sectionId === "string" ? e.sectionId : null,
      occurredAt: typeof e.occurredAt === "string" ? e.occurredAt : null,
    });
  }

  let entry: EntrySourceInput | null = null;
  if (o.entry != null) {
    if (typeof o.entry !== "object") return { ok: false, error: "bad entry" };
    const e = o.entry as Record<string, unknown>;
    entry = {
      search: typeof e.search === "string" ? e.search : null,
      referrer: typeof e.referrer === "string" ? e.referrer : null,
    };
  }

  let closeVisitId: string | null = null;
  if (o.closeVisitId != null) {
    if (!isUuid(o.closeVisitId)) return { ok: false, error: "bad closeVisitId" };
    closeVisitId = o.closeVisitId;
  }
  const closeReason =
    o.closeReason === "pagehide" || o.closeReason === "inactivity" ? o.closeReason : null;
  const gaClientId = normalizeGaClientId(o.gaClientId);

  return {
    ok: true,
    body: {
      visitorId: o.visitorId,
      visitId: o.visitId,
      events,
      gaClientId,
      entry,
      closeVisitId,
      closeReason,
    },
  };
}

async function loadVisitLifecycleEvents(
  db: SupabaseClient,
  visitId: string,
): Promise<LifecycleEvent[]> {
  const { data, error } = await db
    .from("analytics_events")
    .select("type, path, section_id, occurred_at")
    .eq("visit_id", visitId)
    .order("occurred_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    type: row.type as LifecycleEvent["type"],
    path: row.path as string,
    sectionId: (row.section_id as string | null) ?? null,
    occurredAt: row.occurred_at as string,
  }));
}

/** End an open Visit and persist Drop-off fields. */
export async function closeJourneyVisit(
  db: SupabaseClient,
  opts: {
    visitId: string;
    reason: "pagehide" | "inactivity";
    nowIso?: string;
  },
): Promise<{ ok: true; closed: boolean } | { ok: false; error: string }> {
  const { data: visit, error: vErr } = await db
    .from("analytics_visits")
    .select("id, ended_at")
    .eq("id", opts.visitId)
    .maybeSingle();
  if (vErr) return { ok: false, error: vErr.message };
  if (!visit) return { ok: true, closed: false };
  if (visit.ended_at) return { ok: true, closed: false };

  let events: LifecycleEvent[];
  try {
    events = await loadVisitLifecycleEvents(db, opts.visitId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "events load failed" };
  }

  const nowIso = opts.nowIso ?? new Date().toISOString();
  const drop =
    opts.reason === "inactivity"
      ? resolveInactivityDropOff(events, nowIso)
      : resolveExplicitDropOff(events, nowIso);
  if (!drop) return { ok: true, closed: false };

  const { error: uErr } = await db
    .from("analytics_visits")
    .update({
      ended_at: drop.endedAt,
      drop_off_path: drop.path,
      drop_off_section: drop.sectionId,
    })
    .eq("id", opts.visitId)
    .is("ended_at", null);
  if (uErr) return { ok: false, error: uErr.message };
  return { ok: true, closed: true };
}

/** Close open Visits for a Visitor whose last event is older than inactivity. */
export async function closeStaleVisitsForVisitor(
  db: SupabaseClient,
  visitorId: string,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  const { data: open } = await db
    .from("analytics_visits")
    .select("id")
    .eq("visitor_id", visitorId)
    .is("ended_at", null)
    .limit(20);
  for (const row of open ?? []) {
    await closeJourneyVisit(db, {
      visitId: row.id as string,
      reason: "inactivity",
      nowIso,
    });
  }
}

/** PostgREST's schema cache (PGRST204) or Postgres itself (42703) not knowing a column. */
function isUnknownColumn(error: { code?: string }): boolean {
  return error.code === "PGRST204" || error.code === "42703";
}

/** Persist Visitor + Visit + events. Idempotent enough for beacons (new event rows). */
export async function persistJourneyIngest(
  db: SupabaseClient,
  body: IngestBody,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { visitorId, visitId, events } = body;

  const { error: vErr } = await db.from("analytics_visitors").upsert(
    { id: visitorId },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (vErr) return { ok: false, error: vErr.message };

  // Referral link stamp — LAST-TOUCH on the Visitor (overwrite with newest).
  // Lives on the Visitor so it persists across visits for the 30-day window,
  // NOT on the frozen Visit entry_source. The client forwards it only on a new
  // visit's first page_view (entry.search), so cross-visit last-touch works;
  // ponytail: same-visit re-click of a different ref link is not re-captured.
  // Best-effort: a stamp hiccup must not fail the whole analytics beacon.
  const ref = resolveEntrySource(body.entry ?? {}).ref;
  if (ref && isValidReferralCodeFormat(ref)) {
    await stampVisitorRef(db, visitorId, ref);
  }

  // Set-if-null only — never clobber an existing ga_client_id.
  if (body.gaClientId) {
    const { error: gaErr } = await db
      .from("analytics_visitors")
      .update({ ga_client_id: body.gaClientId })
      .eq("id", visitorId)
      .is("ga_client_id", null);
    if (gaErr) return { ok: false, error: gaErr.message };
  }

  if (body.closeVisitId) {
    const closed = await closeJourneyVisit(db, {
      visitId: body.closeVisitId,
      reason: body.closeReason === "pagehide" ? "pagehide" : "inactivity",
    });
    if (!closed.ok) return closed;
  }

  // Best-effort: end any other stale open Visits for this Visitor (silent ≥30m).
  await closeStaleVisitsForVisitor(db, visitorId);

  if (events.length === 0) return { ok: true };

  // Freeze Entry source + country on first INSERT only — race-safe like visitors.
  const resolved = resolveEntrySource(body.entry ?? {});
  const country = normalizeCountryCode(body.country) || UNKNOWN_COUNTRY;
  const base = {
    id: visitId,
    visitor_id: visitorId,
    entry_source: resolved.entrySource,
    entry_medium: resolved.entryMedium,
    entry_campaign: resolved.entryCampaign,
    referrer_host: resolved.referrerHost,
    country,
  };
  const detail = {
    entry_content: resolved.entryContent,
    entry_term: resolved.entryTerm,
    entry_click_id_kind: resolved.clickIdKind,
    entry_click_id: resolved.clickId,
    entry_app: isEntryApp(body.entryApp) ? body.entryApp : null,
    // `entry` rides only on a Visit's first page view, so that view's path
    // is where the Visit landed.
    landing_path: body.entry ? (events[0]?.path ?? null) : null,
  };
  const insertVisit = (row: Record<string, unknown>) =>
    db.from("analytics_visits").upsert(row, { onConflict: "id", ignoreDuplicates: true });
  let { error: visitErr } = await insertVisit({ ...base, ...detail });
  // The code can deploy before the migration that adds the detail columns
  // (20261113090000). Losing the detail for those Visits beats losing the Visits.
  if (visitErr && isUnknownColumn(visitErr)) ({ error: visitErr } = await insertVisit(base));
  if (visitErr) return { ok: false, error: visitErr.message };

  const rows = events.map((e) => ({
    visit_id: visitId,
    visitor_id: visitorId,
    type: e.type,
    path: e.path,
    section_id: e.sectionId ?? null,
    occurred_at: e.occurredAt && !Number.isNaN(Date.parse(e.occurredAt))
      ? e.occurredAt
      : new Date().toISOString(),
  }));

  const { error: eErr } = await db.from("analytics_events").insert(rows);
  if (eErr) return { ok: false, error: eErr.message };

  return { ok: true };
}
