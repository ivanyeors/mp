import { supabaseAdmin } from "@/lib/supabase/server";
import { isCustomersResult, resultEmailPattern } from "@/lib/results/owner";
import { RESULTS_GROUP } from "@/lib/crm/timeline/groups";
import { canonicalAt, EMPTY_BATCH } from "@/lib/crm/timeline/merge";
import { cappedBatch, joinBatches, newestRows, readStream } from "@/lib/crm/timeline/read";
import type {
  TimelineAdapter,
  TimelineBatch,
  TimelineCustomer,
  TimelineEntry,
  TimelineRef,
} from "@/lib/crm/timeline/types";

/**
 * Results on the Customer timeline, matched as the storefront matches them:
 * `customer_id`, or the email (`isCustomersResult`, shared with
 * `authorizeResultAccess`), so a guest Result shows too.
 *
 * A Result stores only three times, and the timeline invents no others:
 *
 * - created (`created_at`), with the current status as a pill. Declined and
 *   expired have no time of their own, so they show only as that pill;
 * - build sent (`assigned_at`);
 * - balance paid (`topup_paid_at`).
 *
 * An accepted Result shows as its Order (the orders adapter). A Staff cancel is
 * the `result.cancel` entry `app/api/results/[id]/cancel/route.ts` writes to
 * `admin_audit_log`. Results emails have no ledger, so they are not listed.
 *
 * A Paired build (two Results sharing `paired_build_id`, the anchor's id) is one
 * entry per fact: created when its first half was, its build sent when the last
 * half was assigned and none is still `held` (the assign route emails the
 * customer only then), its balance paid once.
 *
 * Drafts (`status` null) are left out, as on the customer's own Results list.
 */

type ResultRow = {
  id: string;
  status: string;
  product_type: string | null;
  suggested_size: string | null;
  suggested_tier: string | null;
  suggested_length: string | null;
  assigned_size: string | null;
  assigned_tier: string | null;
  assigned_length: string | null;
  customer_id: string | null;
  customer_email: string | null;
  paired_build_id: string | null;
  created_at: string;
  assigned_at: string | null;
  topup_paid_at: string | null;
};

const RESULT_COLUMNS =
  "id, status, product_type, suggested_size, suggested_tier, suggested_length, assigned_size, assigned_tier, assigned_length, customer_id, customer_email, paired_build_id, created_at, assigned_at, topup_paid_at";

/**
 * Results read per page, by id and by email each: a Customer has a handful.
 * Past this many created before the cursor, the oldest one read is the floor.
 */
export const RESULTS_CAP = 100;

const capitalise = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : null);

/** `Mpillow M · Premium`, `Mbolster 90`: the names the assign route gives a build. */
export function resultLabel(r: ResultRow): string {
  if (r.product_type === "bolster") {
    const length = r.assigned_length ?? r.suggested_length;
    return length ? `Mbolster ${length}` : "Mbolster";
  }
  if (r.product_type === "pillow") {
    const parts = [r.assigned_size ?? r.suggested_size, capitalise(r.assigned_tier ?? r.suggested_tier)].filter(Boolean);
    return parts.length ? `Mpillow ${parts.join(" · ")}` : "Mpillow";
  }
  return "Customisation";
}

/** A Result, or the two halves of a Paired build, anchor first. */
type Build = { key: string; members: ResultRow[] };

function buildsOf(rows: readonly ResultRow[]): Build[] {
  const byKey = new Map<string, ResultRow[]>();
  for (const r of rows) {
    const key = r.paired_build_id ?? r.id;
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }
  return [...byKey].map(([key, members]) => ({
    key,
    members: members.sort((a, b) => (a.id === key ? -1 : b.id === key ? 1 : a.created_at < b.created_at ? -1 : 1)),
  }));
}

function extreme(values: readonly (string | null)[], pick: "earliest" | "latest"): string | null {
  let out: string | null = null;
  for (const v of values) {
    const at = v === null ? null : canonicalAt(v);
    if (at !== null && (out === null || (pick === "latest" ? at > out : at < out))) out = at;
  }
  return out;
}

const refOf = (b: Build): TimelineRef => ({ type: "result", id: b.key, href: `/settings/results/${b.key}` });
const labelOf = (b: Build) => b.members.map(resultLabel).join(" + ");
const nounOf = (b: Build) => (b.members.length > 1 ? "Paired build" : "Result");

function buildEntries(b: Build): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const ref = refOf(b);
  const label = labelOf(b);
  const created = extreme(b.members.map((m) => m.created_at), "earliest");
  if (created) {
    out.push({
      id: `result.created:${b.key}`,
      at: created,
      kind: "result.created",
      ref,
      summary: `${nounOf(b)} created: ${label}`,
      status: [...new Set(b.members.map((m) => m.status))].join(" · "),
    });
  }
  const sent = b.members.some((m) => m.status === "held") ? null : extreme(b.members.map((m) => m.assigned_at), "latest");
  if (sent) {
    out.push({ id: `result.build_sent:${b.key}`, at: sent, kind: "result.build_sent", ref, summary: `Build sent: ${label}` });
  }
  const paid = extreme(b.members.map((m) => m.topup_paid_at), "latest");
  if (paid) {
    out.push({ id: `result.balance_paid:${b.key}`, at: paid, kind: "result.balance_paid", ref, summary: `Balance paid: ${label}` });
  }
  return out;
}

/**
 * The Customer's Results created at or before the cursor, newest first, plus the
 * other half of any Paired build the window cut in two.
 */
async function readResults(customer: TimelineCustomer, before: string | null) {
  const db = supabaseAdmin();
  const live = () => db.from("mp_config_responses").select(RESULT_COLUMNS).not("status", "is", null);
  const pattern = customer.email ? resultEmailPattern(customer.email) : null;
  const lists = await Promise.all([
    newestRows<ResultRow>(live().eq("customer_id", customer.id), "created_at", before, RESULTS_CAP),
    pattern
      ? newestRows<ResultRow>(live().filter("customer_email", "imatch", pattern), "created_at", before, RESULTS_CAP)
      : Promise.resolve([] as ResultRow[]),
  ]);

  let floor: string | null = null;
  for (const list of lists) {
    if (list.length < RESULTS_CAP) continue;
    const f = canonicalAt(list[list.length - 1]!.created_at);
    if (f !== null && (floor === null || f > floor)) floor = f;
  }

  const rows = new Map<string, ResultRow>();
  for (const r of lists.flat()) if (isCustomersResult(customer, r)) rows.set(r.id, r);

  const halves = new Map<string, number>();
  for (const r of rows.values()) if (r.paired_build_id) halves.set(r.paired_build_id, (halves.get(r.paired_build_id) ?? 0) + 1);
  const cut = [...halves].filter(([, n]) => n < 2).map(([key]) => key);
  if (cut.length) {
    const { data, error } = await live().in("paired_build_id", cut);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as ResultRow[]) if (isCustomersResult(customer, r)) rows.set(r.id, r);
  }
  return { rows: [...rows.values()], floor };
}

type AuditRow = { id: string; entity_id: string; created_at: string };

/** Staff cancels of these Results, from the audit entry the cancel route writes. */
function readCancels(builds: readonly Build[], before: string | null, limit: number): Promise<TimelineBatch> {
  const buildOf = new Map<string, Build>();
  for (const b of builds) for (const m of b.members) buildOf.set(m.id, b);
  if (!buildOf.size) return Promise.resolve(EMPTY_BATCH);
  return readStream<AuditRow>(
    supabaseAdmin()
      .from("admin_audit_log")
      .select("id, entity_id, created_at")
      .eq("entity_type", "mp_config_response")
      .eq("action", "result.cancel")
      .in("entity_id", [...buildOf.keys()]),
    "created_at",
    before,
    limit,
    (a) => {
      const b = buildOf.get(a.entity_id);
      const row = b?.members.find((m) => m.id === a.entity_id);
      if (!b || !row) return null;
      // Cancelling the anchor ends the pair; cancelling the Mbolster leaves the Mpillow.
      const what = row.id === b.key && b.members.length > 1 ? `Paired build: ${labelOf(b)}` : resultLabel(row);
      return {
        id: `result.cancelled:${a.id}`,
        at: a.created_at,
        kind: "result.cancelled",
        ref: refOf(b),
        summary: `Cancelled by Staff: ${what}`,
      };
    },
  );
}

export const resultsAdapter: TimelineAdapter = {
  key: "results",
  group: RESULTS_GROUP,
  kinds: ["result.created", "result.build_sent", "result.balance_paid", "result.cancelled"],
  permission: "results",
  async load(customer, before, limit) {
    const { rows, floor } = await readResults(customer, before);
    const builds = buildsOf(rows);
    return joinBatches([
      cappedBatch(builds.flatMap(buildEntries), before, floor),
      await readCancels(builds, before, limit),
    ]);
  },
};
