/**
 * The daily Aftercare job (PRD customer-crm slices 07 and 08, ADR 0027 f, g),
 * chained onto the `results-sla` cron: there is no third cron (README, fourth
 * hazard).
 *
 * Each Aftercare message is one runner here, and runs on its own: one that
 * throws is reported as `{ ok: false, error }` and the others still run. CRM
 * slice 08 adds the check-up as a second entry in {@link AFTERCARE_RUNNERS},
 * with its own report, and nothing else in the cron route changes.
 *
 * A manual re-run is safe: every message is claimed in a ledger before it is
 * sent, so nobody gets one twice.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { runReviewRequests } from "./review-request-server";

export type AftercareJobContext = { origin: string; now: Date };

type AftercareRunner<R> = (admin: SupabaseClient, ctx: AftercareJobContext) => Promise<R>;

export const AFTERCARE_RUNNERS = {
  /** CRM slice 07: one Review request per Customer, 14 days after delivery. */
  reviewRequests: (admin, ctx) => runReviewRequests(admin, ctx),
} satisfies Record<string, AftercareRunner<unknown>>;

type Runners = typeof AFTERCARE_RUNNERS;
export type AftercareJobResult = {
  [K in keyof Runners]: Awaited<ReturnType<Runners[K]>> | { ok: false; error: string };
};

export async function runAftercareMessages(
  admin: SupabaseClient,
  ctx: AftercareJobContext,
): Promise<AftercareJobResult> {
  const out: Record<string, unknown> = {};
  // One after another, so two message types never compete for the same sender.
  for (const [key, run] of Object.entries(AFTERCARE_RUNNERS) as Array<[string, AftercareRunner<unknown>]>) {
    try {
      out[key] = await run(admin, ctx);
    } catch (e) {
      out[key] = { ok: false, error: e instanceof Error ? e.message : `${key} failed` };
    }
  }
  return out as AftercareJobResult;
}
