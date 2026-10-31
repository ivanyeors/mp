import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { z } from "zod";
import { getPartnerContext, isPartnerActive } from "@/lib/auth/partner";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getEmailTransport } from "@/lib/email";
import { renderPartnerListingUpdatedEmail } from "@/lib/email/ops";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { getSupportInbox } from "@/lib/email/contact";
import { getSiteOrigin } from "@/lib/site-url";
import { withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import {
  BranchSaveError,
  BranchesSchema,
  savePartnerBranches,
  syncBranchNames,
} from "@/lib/locations/save-branches";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  postal_code: z.string().trim().max(20).optional().nullable(),
  branch_name: z.string().trim().max(120).optional().nullable(),
  logo_url: z.string().url().max(2000).optional().nullable(),
  /** The partner's other clinics; replaces the list when sent (ADR 0037). */
  branches: BranchesSchema.optional(),
});

/**
 * True when `url` is a public logo we stored under the caller's own partner
 * folder: our own Supabase project's storage, not just a matching path on any
 * host (the Admin Panel renders it as a raw <img>).
 */
function isOwnLogoUrl(url: string, partnerId: string): boolean {
  try {
    const parsed = new URL(url);
    const storageOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
    return (
      parsed.origin === storageOrigin &&
      parsed.pathname.startsWith(`/storage/v1/object/public/media/partner-logos/${partnerId}/`)
    );
  } catch {
    return false;
  }
}

/** Notify Staff that a partner edited their public listing, with a 1-click hide. */
async function notifyStaff(partnerId: string, name: string): Promise<void> {
  const hideUrl = `${getSiteOrigin()}${withLocale("/settings/partners/hide", DEFAULT_LOCALE)}?partner=${encodeURIComponent(partnerId)}`;
  try {
    await getEmailTransport().send({
      to: getSupportInbox(),
      from: getDefaultFromAddress(),
      ...renderPartnerListingUpdatedEmail({ partnerName: name, hideUrl }),
    });
  } catch (e) {
    // ponytail: notification is best-effort — never fail the partner's save on it.
    console.error("[partner/profile] staff notify failed:", (e as Error).message);
  }
}

/**
 * Update ONLY the caller's own linked partners row (id = ctx.partnerId) and
 * that row's branches (parent_id = ctx.partnerId).
 */
export async function PATCH(req: Request) {
  const ctx = await getPartnerContext();
  if (!isPartnerActive(ctx)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }
  const b = parsed.data;

  // logo_url must be a re-encoded logo we stored for THIS partner (savePartnerLogo
  // writes media/partner-logos/{partnerId}/…). Reject arbitrary URLs so PATCH
  // can't bypass the optimize/size/dimension guards on the upload route (AC3).
  if (b.logo_url && !isOwnLogoUrl(b.logo_url, ctx.partnerId)) {
    return NextResponse.json({ error: "Invalid logo URL" }, { status: 400 });
  }

  const update: Record<string, unknown> = { name: b.name };
  if (b.description !== undefined) update.description = b.description || null;
  if (b.address !== undefined) update.address = b.address || null;
  if (b.postal_code !== undefined) update.postal_code = b.postal_code || null;
  if (b.branch_name !== undefined) update.branch_name = b.branch_name || null;
  if (b.logo_url !== undefined) update.logo_url = b.logo_url || null;

  const { error } = await supabaseAdmin()
    .from("partners")
    .update(update)
    .eq("id", ctx.partnerId); // guard: never another partner's row
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    if (b.branches) await savePartnerBranches(ctx.partnerId, b.branches);
    else await syncBranchNames(ctx.partnerId, b.name);
  } catch (e) {
    invalidateTag("locations"); // the main row already saved
    const status = e instanceof BranchSaveError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }

  invalidateTag("locations");
  await notifyStaff(ctx.partnerId, b.name);

  // The saved clinics with their ids, so the form's next save updates rather than re-adds.
  const { data: branches } = await supabaseAdmin()
    .from("partners")
    .select("id, branch_name, address, postal_code")
    .eq("parent_id", ctx.partnerId)
    .order("position", { ascending: true });
  return NextResponse.json({ ok: true, branches: branches ?? [] });
}
