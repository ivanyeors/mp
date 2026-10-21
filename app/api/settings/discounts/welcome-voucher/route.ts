import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getWelcomeVoucherSummary } from "@/lib/customer-migration/welcome-voucher";
import {
  parseWelcomeVoucherTerms,
  readWelcomeVoucherTerms,
  welcomeVoucherIssuing,
  welcomeVoucherTermsSchema,
  welcomeVoucherTermsToStored,
} from "@/lib/customer-migration/welcome-voucher-terms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Discounts → Welcome-back voucher (PRD-shopify-customer-migration slice 06):
 * the six `site_settings` terms the Claim reads (owner decision 2), and what
 * the vouchers cost so far. Seeing and changing both need `discounts`.
 *
 * A change applies to Claims from now on. A voucher already issued keeps the
 * terms it was issued with, and a Customer Claimed while issuing was off is
 * never issued one later (a Claim happens once).
 */
export async function GET() {
  try {
    await requireAdminContext("discounts");
  } catch (res) {
    return res as NextResponse;
  }

  try {
    const admin = supabaseAdmin();
    const [parsed, summary] = await Promise.all([readWelcomeVoucherTerms(admin), getWelcomeVoucherSummary(admin)]);
    return NextResponse.json({
      ok: true,
      terms: parsed.terms,
      malformed: parsed.malformed,
      issuing: welcomeVoucherIssuing(parsed),
      summary,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("discounts");
  } catch (res) {
    return res as NextResponse;
  }

  const body = await req.json().catch(() => null);
  const parsed = welcomeVoucherTermsSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid terms" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  let before;
  try {
    before = await readWelcomeVoucherTerms(admin);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }

  // What is stored, read back the way the SQL reads it: a value sent with a
  // free-shipping voucher is dropped, and money is rounded to the cent.
  const stored = welcomeVoucherTermsToStored(parsed.data);
  const after = parseWelcomeVoucherTerms(stored);
  const next = after.terms;
  const updatedAt = new Date().toISOString();
  const rows = Object.entries(stored).map(([key, value]) => ({
    key,
    value,
    updated_at: updatedAt,
  }));
  const { error } = await admin.from("site_settings").upsert(rows, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateTag("site-settings");
  await recordAdminAction({
    actor: ctx,
    action: "welcome_voucher_terms.update",
    entityType: "site_setting",
    entityId: "welcome_voucher",
    before: before.terms,
    after: next,
  });

  return NextResponse.json({
    ok: true,
    terms: next,
    malformed: after.malformed,
    issuing: welcomeVoucherIssuing(after),
  });
}
