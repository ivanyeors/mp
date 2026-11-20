import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentGoogleReviewLink } from "@/lib/crm/reviews";

export type LinkHow = "suggestion" | "manual";

type LinkRow = {
  linked: boolean;
  customer_id: string;
  how: LinkHow;
  linked_by_profile_id: string | null;
  linked_at: string;
};

export type LinkResult =
  | { ok: true; link: { customerId: string; how: LinkHow; linkedAt: string } }
  | { ok: false; reason: "already_linked"; current: CurrentGoogleReviewLink }
  | { ok: false; reason: "not_found" };

const isMissingReference = (e: { code?: string } | null) => e?.code === "23503";

export async function linkGoogleReview(
  admin: SupabaseClient,
  input: { reviewId: string; customerId: string; how: LinkHow; profileId: string | null },
): Promise<LinkResult> {
  const { data, error } = await admin.rpc("link_google_review", {
    p_google_review_id: input.reviewId,
    p_customer_id: input.customerId,
    p_how: input.how,
    p_profile_id: input.profileId,
  });
  if (isMissingReference(error)) return { ok: false, reason: "not_found" };
  if (error) throw new Error(`link_google_review: ${error.message}`);
  const row = ((data ?? []) as LinkRow[])[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (row.linked) return { ok: true, link: { customerId: row.customer_id, how: row.how, linkedAt: row.linked_at } };

  const { data: holder } = await admin
    .from("customers")
    .select("first_name, last_name, email")
    .eq("id", row.customer_id)
    .maybeSingle();
  const h = holder as { first_name: string | null; last_name: string | null; email: string | null } | null;
  return {
    ok: false,
    reason: "already_linked",
    current: {
      customerId: row.customer_id,
      name: [h?.first_name, h?.last_name].filter((p) => p?.trim()).join(" ") || null,
      email: h?.email ?? null,
      linkedAt: row.linked_at,
    },
  };
}

export async function unlinkGoogleReview(
  admin: SupabaseClient,
  input: { reviewId: string; customerId: string; profileId: string | null },
): Promise<boolean> {
  const { data, error } = await admin.rpc("unlink_google_review", {
    p_google_review_id: input.reviewId,
    p_customer_id: input.customerId,
    p_profile_id: input.profileId,
  });
  if (error) throw new Error(`unlink_google_review: ${error.message}`);
  return data === true;
}

export type RejectResult = "rejected" | "linked" | "not_found";

export async function rejectGoogleReviewMatch(
  admin: SupabaseClient,
  input: { reviewId: string; customerId: string; profileId: string | null },
): Promise<RejectResult> {
  const { data, error } = await admin.rpc("reject_google_review_match", {
    p_google_review_id: input.reviewId,
    p_customer_id: input.customerId,
    p_profile_id: input.profileId,
  });
  if (isMissingReference(error)) return "not_found";
  if (error) throw new Error(`reject_google_review_match: ${error.message}`);
  return data === "linked" ? "linked" : "rejected";
}
