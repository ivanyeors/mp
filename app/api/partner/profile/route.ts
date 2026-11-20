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
import { toWebUrl } from "@/lib/format/web-url";
import { isStoredLogoUrl, partnerLogoFolder } from "@/lib/partner-upload/urls";
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
  website: z.string().trim().max(500).optional().nullable(),
  logo_url: z.string().url().max(2000).optional().nullable(),
  branches: BranchesSchema.optional(),
});

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

  if (b.logo_url && !isStoredLogoUrl(b.logo_url, partnerLogoFolder(ctx.partnerId))) {
    const { data: current } = await supabaseAdmin()
      .from("partners")
      .select("logo_url")
      .eq("id", ctx.partnerId)
      .maybeSingle();
    if (b.logo_url !== current?.logo_url) {
      return NextResponse.json({ error: "Invalid logo URL" }, { status: 400 });
    }
  }

  let websiteUrl: string | null | undefined;
  if (b.website !== undefined) {
    websiteUrl = toWebUrl(b.website);
    if (b.website && !websiteUrl) {
      return NextResponse.json(
        { error: "Enter your website as a full link, like https://yourclinic.com" },
        { status: 400 },
      );
    }
  }

  const update: Record<string, unknown> = { name: b.name };
  if (websiteUrl !== undefined) update.website_url = websiteUrl;
  if (b.description !== undefined) update.description = b.description || null;
  if (b.address !== undefined) update.address = b.address || null;
  if (b.postal_code !== undefined) update.postal_code = b.postal_code || null;
  if (b.branch_name !== undefined) update.branch_name = b.branch_name || null;
  if (b.logo_url !== undefined) update.logo_url = b.logo_url || null;

  const { error } = await supabaseAdmin()
    .from("partners")
    .update(update)
    .eq("id", ctx.partnerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    if (b.branches) await savePartnerBranches(ctx.partnerId, b.branches);
    else await syncBranchNames(ctx.partnerId, b.name);
  } catch (e) {
    invalidateTag("locations");
    const status = e instanceof BranchSaveError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }

  invalidateTag("locations");
  await notifyStaff(ctx.partnerId, b.name);

  const { data: branches } = await supabaseAdmin()
    .from("partners")
    .select("id, branch_name, address, postal_code")
    .eq("parent_id", ctx.partnerId)
    .order("position", { ascending: true });
  return NextResponse.json({ ok: true, branches: branches ?? [] });
}
