import { supabaseAdmin } from "@/lib/supabase/server";
import { secretMatches } from "@/lib/auth/secret";
import type { MpConfigVariant } from "@/lib/mp-config/flow-variant";
import {
  draftAnswersFrom,
  draftConfiguratorOf,
  type DraftAnswers,
} from "@/lib/configurator/continue-draft";

/** A guest's own Draft Result, reopened from its continue link (ADR 0050). */
export type ResumeDraft = {
  id: string;
  /** The Result access token the link carried; the configurator keeps it on this device. */
  token: string;
  answers: Partial<DraftAnswers>;
  /** The email the guest gave on the first question, prefilled at checkout. */
  email: string;
  /** Where it was started; the link is built for that configurator. */
  configurator: MpConfigVariant;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `/mp-config?draft=<id>&token=<t>` (and `/mp-basic`). Null for anything that
 * is not an Mpillow Draft whose access token the link carries, and the page
 * then shows the ordinary configurator, so a stale or forged link learns
 * nothing about the Draft.
 *
 * The token, and only the token: a link is the shopper's proof, wherever they
 * open it. A Draft once held, paid or sent to the build team is no longer a
 * Draft and never reopens here. An Assisted customisation is not reopened
 * either: its Staff member's link, not this one, is what makes it one.
 */
export async function loadResumeDraft(
  id: string | undefined,
  token: string | undefined,
): Promise<ResumeDraft | null> {
  if (!id || !UUID.test(id) || !token) return null;
  const { data: row } = await supabaseAdmin()
    .from("mp_config_responses")
    .select("id, status, source, product_type, data, customer_email, access_token")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.status != null) return null;
  if ((row.product_type ?? "pillow") !== "pillow") return null;
  if (row.source === "staff_assisted") return null;
  if (!secretMatches(row.access_token ?? undefined, token)) return null;

  return {
    id: row.id,
    token,
    answers: draftAnswersFrom(row.data),
    email: row.customer_email ?? "",
    configurator: draftConfiguratorOf(row.data),
  };
}
