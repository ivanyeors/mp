import type { SupabaseClient } from "@supabase/supabase-js";
import { runCheckups } from "./checkup-server";
import { runReviewRequests } from "./review-request-server";

export type AftercareJobContext = { origin: string; now: Date };

type AftercareRunner<R> = (admin: SupabaseClient, ctx: AftercareJobContext) => Promise<R>;

export const AFTERCARE_RUNNERS = {
  reviewRequests: (admin, ctx) => runReviewRequests(admin, ctx),
  checkups: (admin, ctx) => runCheckups(admin, ctx),
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
  for (const [key, run] of Object.entries(AFTERCARE_RUNNERS) as Array<[string, AftercareRunner<unknown>]>) {
    try {
      out[key] = await run(admin, ctx);
    } catch (e) {
      out[key] = { ok: false, error: e instanceof Error ? e.message : `${key} failed` };
    }
  }
  return out as AftercareJobResult;
}
