import { supabaseAdmin } from "@/lib/supabase/server";
import { secretMatches } from "@/lib/auth/secret";
import type { MpConfigVariant } from "@/lib/mp-config/flow-variant";
import {
  draftAnswersFrom,
  draftConfiguratorOf,
  type DraftAnswers,
} from "@/lib/configurator/continue-draft";

export type ResumeDraft = {
  id: string;
  token: string;
  answers: Partial<DraftAnswers>;
  email: string;
  configurator: MpConfigVariant;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
