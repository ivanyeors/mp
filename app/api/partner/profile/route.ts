import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { getPartnerContext, isPartnerActive } from "@/lib/auth/partner";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getEmailTransport } from "@/lib/email";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { getSupportInbox } from "@/lib/email/contact";
import { getSiteOrigin } from "@/lib/site-url";
import { withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  postal_code: z.string().trim().max(20).optional().nullable(),
  logo_url: z.string().url().max(2000).optional().nullable(),
});

/** True when `url` is a public logo we stored under the caller's own partner folder. */
function isOwnLogoUrl(url: string, partnerId: string): boolean {
  try {
    return new URL(url).pathname.includes(
      `/storage/v1/object/public/media/partner-logos/${partnerId}/`,
    );
  } catch {
    return false;
  }
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Notify Staff that a partner edited their public listing, with a 1-click hide. */
async function notifyStaff(partnerId: string, name: string): Promise<void> {
  const hideUrl = `${getSiteOrigin()}${withLocale("/settings/partners/hide", DEFAULT_LOCALE)}?partner=${encodeURIComponent(partnerId)}`;
  const subject = `Partner listing updated: ${name}`;
  const text = `${name} updated their public partner listing (/our-partners).\n\nReview it in Partners, or open the hide-confirmation page:\n${hideUrl}`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;">
  <p><strong>${escapeHtml(name)}</strong> updated their public partner listing (<code>/our-partners</code>).</p>
  <p><a href="${hideUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:8px;text-decoration:none;">Review &amp; hide this listing</a></p>
  <p style="color:#666;font-size:12px;">Opens a confirmation page; you must be signed in as Staff to hide it.</p>
  </body></html>`;
  try {
    await getEmailTransport().send({
      to: getSupportInbox(),
      from: getDefaultFromAddress(),
      subject,
      text,
      html,
    });
  } catch (e) {
    // ponytail: notification is best-effort — never fail the partner's save on it.
    console.error("[partner/profile] staff notify failed:", (e as Error).message);
  }
}

/** Update ONLY the caller's own linked partners row (id = ctx.partnerId). */
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
  if (b.logo_url !== undefined) update.logo_url = b.logo_url || null;

  const { error } = await supabaseAdmin()
    .from("partners")
    .update(update)
    .eq("id", ctx.partnerId); // guard: never another partner's row
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag("locations", "max");
  await notifyStaff(ctx.partnerId, b.name);
  return NextResponse.json({ ok: true });
}
