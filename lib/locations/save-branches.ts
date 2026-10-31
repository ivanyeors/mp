import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { planBranchSave, type BranchInput } from "./branches";

/** Most further clinics one partner can list; well past any partner we have. */
export const MAX_PARTNER_BRANCHES = 30;

/** The `branches` field the Admin Panel and the Partner Hub send; no id = a new clinic. */
export const BranchesSchema = z
  .array(
    z.object({
      id: z.string().uuid().optional(),
      branch_name: z.string().trim().max(120).nullable().optional(),
      address: z.string().trim().min(1, "Each extra location needs an address.").max(500),
      postal_code: z.string().trim().max(20).nullable().optional(),
    }),
  )
  .max(MAX_PARTNER_BRANCHES, `A partner can list up to ${MAX_PARTNER_BRANCHES + 1} locations.`);

/** A refused branch save, with the HTTP status the route answers with. */
export class BranchSaveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BranchSaveError";
  }
}

const IN_USE =
  "A location you removed is still in use, by Results recorded there or by a booking. Keep it, or move those first.";

/**
 * Replace a partner's further clinics with `branches` (ADR 0037). Every write
 * is scoped to `parent_id = parentId`, so a caller can only ever touch the
 * branches of the main row it names, and the Partner Hub passes the signed-in
 * partner's own row. Branches take the main row's current name and, when new,
 * its `bookable`; they are never `visible` on their own (the main row decides
 * /our-partners).
 *
 * ponytail: three statements, no transaction. Updates and inserts run before
 * the delete, so a failure part-way leaves a clinic too many, never one lost.
 */
export async function savePartnerBranches(parentId: string, branches: BranchInput[]): Promise<void> {
  if (branches.length > MAX_PARTNER_BRANCHES) {
    throw new BranchSaveError(`A partner can list up to ${MAX_PARTNER_BRANCHES + 1} locations.`, 400);
  }
  const admin = supabaseAdmin();

  const { data: parent, error: parentError } = await admin
    .from("partners")
    .select("id, name, type, parent_id, bookable")
    .eq("id", parentId)
    .maybeSingle();
  if (parentError) throw new BranchSaveError(parentError.message, 500);
  if (!parent) throw new BranchSaveError("Location not found.", 404);
  if (parent.parent_id) {
    throw new BranchSaveError("Save a partner's locations from its main location.", 400);
  }
  if (parent.type !== "partner" && branches.length > 0) {
    throw new BranchSaveError("Only a partner lists more than one location.", 400);
  }

  const { data: existing, error: existingError } = await admin
    .from("partners")
    .select("id")
    .eq("parent_id", parentId);
  if (existingError) throw new BranchSaveError(existingError.message, 500);

  const plan = planBranchSave(
    (existing ?? []).map((r) => r.id as string),
    branches,
  );
  if (plan.unknownIds.length > 0) {
    throw new BranchSaveError(
      "These locations changed since you opened them. Reload and try again.",
      409,
    );
  }

  const place = (b: BranchInput, position: number) => ({
    name: parent.name as string,
    type: "partner" as const,
    visible: false,
    branch_name: b.branch_name?.trim() || null,
    address: b.address.trim(),
    postal_code: b.postal_code?.trim() || null,
    position,
  });

  for (const b of plan.updates) {
    const { error } = await admin
      .from("partners")
      .update(place(b, b.position))
      .eq("id", b.id)
      .eq("parent_id", parentId);
    if (error) throw new BranchSaveError(error.message, 500);
  }

  if (plan.inserts.length > 0) {
    const { error } = await admin.from("partners").insert(
      plan.inserts.map((b) => ({
        ...place(b, b.position),
        parent_id: parentId,
        bookable: parent.bookable ?? true,
      })),
    );
    if (error) throw new BranchSaveError(error.message, 500);
  }

  if (plan.deleteIds.length > 0) {
    const { error } = await admin
      .from("partners")
      .delete()
      .in("id", plan.deleteIds)
      .eq("parent_id", parentId);
    if (error) {
      throw new BranchSaveError(error.code === "23503" ? IN_USE : error.message, error.code === "23503" ? 409 : 500);
    }
  }
}

/** Copy a renamed partner's name onto its branches, which every Location reader shows. */
export async function syncBranchNames(parentId: string, name: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("partners")
    .update({ name })
    .eq("parent_id", parentId);
  if (error) throw new BranchSaveError(error.message, 500);
}
