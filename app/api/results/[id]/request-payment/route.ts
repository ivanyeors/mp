import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getEmailTransport } from "@/lib/email";
import { loadEmailCopy } from "@/lib/email/copy-store";
import {
  RESULT_EMAIL_COPY,
  renderResultAssignedEmail,
  renderResultUpdatedEmail,
  statusUrl,
} from "@/lib/email/results";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { ASSIGNED_BUILD_COLUMNS, loadAssignedBuild } from "@/lib/results/assigned-build";
import { discountRowOf } from "@/lib/results/discount";
import { needsCustomerFinish } from "@/lib/results/needs-customer-finish";
import { getPublicOrigin } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-send the priced "final build ready" email and hand Staff the customer's
 * tokenised status URL to paste into WhatsApp.
 *
 * The price is recomputed through `priceResult()` inside `loadAssignedBuild`,
 * exactly as assign computed it — Staff never supply an amount, and this route
 * accepts no body at all.
 *
 * It then STORES that number. The email and the Result used to be able to
 * disagree: Staff re-configure a build (`/api/results/[id]/reconfigure`) or
 * Costings moves, the email quotes the fresh total, and Accept charges the
 * stale `final_amount` still on the row. Writing it here means "resend the
 * payment request" re-quotes and re-prices the same build in one action.
 * Idempotent — a second press recomputes the same total — and guarded on the
 * assigned, order-less state, so a Result mid-payment is never repriced.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  const { id } = await params;
  const admin = supabaseAdmin();
  const origin = getPublicOrigin(req);

  const { data: row, error: loadErr } = await admin
    .from("mp_config_responses")
    .select(
      `${ASSIGNED_BUILD_COLUMNS}, status, source, authorized_amount, final_amount, customer_email, access_token, order_id, coupon_code`,
    )
    .eq("id", id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status !== "assigned") {
    return NextResponse.json(
      { error: `Save the assignment first (status is ${row.status ?? "unknown"})` },
      { status: 400 },
    );
  }
  if (!row.access_token) {
    return NextResponse.json(
      { error: "Result has no customer link" },
      { status: 400 },
    );
  }

  const build = await loadAssignedBuild(admin, row);
  if (!build.ok) return NextResponse.json({ error: build.error }, { status: 400 });

  // Re-quoting and re-pricing are one action: the number in the email is the
  // number Accept charges. Guarded on the state the checks above saw, so a
  // Result that accepted in between keeps the amount it is paying.
  let repriced: "unchanged" | "updated" | "skipped" = "unchanged";
  const storedFinal = row.final_amount != null ? Number(row.final_amount) : null;
  if (storedFinal == null || Math.abs(storedFinal - build.pricing.total) >= 0.005) {
    const { data: updated, error: priceErr } = await admin
      .from("mp_config_responses")
      .update({ final_amount: build.pricing.total })
      .eq("id", id)
      .eq("status", "assigned")
      .is("order_id", null)
      .select("id");
    if (priceErr) return NextResponse.json({ error: priceErr.message }, { status: 500 });
    repriced = updated?.length ? "updated" : "skipped";
    if (repriced === "skipped") {
      return NextResponse.json(
        { error: "This Result moved on — reload it before requesting payment again" },
        { status: 409 },
      );
    }
  }

  const label = (itemId: number) => build.nameByItem.get(itemId) ?? `Item #${itemId}`;
  const fillingSummary = build.lines
    .filter((l) => l.role === "filling")
    .map((l) => `${label(l.item_id)} ×${l.quantity}`);
  const preferences = build.lines
    .filter((l) => l.role === "preference")
    .map((l) => `${l.category}: ${label(l.item_id)}`);
  const addons = build.lines
    .filter((l) => l.role === "addon")
    .map((l) => `${label(l.item_id)} ×${l.quantity}`);

  const link = statusUrl(origin, id, row.access_token);

  const spec = {
    origin,
    resultId: id,
    accessToken: row.access_token,
    productType: row.product_type ?? "pillow",
    size: row.assigned_size,
    tier: row.assigned_tier,
    length: row.assigned_length,
    fillingSummary,
    preferences,
    addons,
    pricing: {
      subtotal: build.pricing.subtotal,
      discount: discountRowOf(row.coupon_code, row.coupon_terms, build.pricing.discount),
      services: build.serviceLines.map((l) => ({ label: l.label, amount: l.msrp })),
      shipping: build.pricing.shipping,
      tax: build.pricing.tax,
      total: build.pricing.total,
      currency: row.currency ?? "SGD",
      authorized: row.authorized_amount != null ? Number(row.authorized_amount) : null,
    },
  };

  // Which of two emails, on one question: has the price moved since the
  // customer was last told?
  //
  // Unchanged is the ordinary case — Staff press this because the customer lost
  // the email, or to get the link for WhatsApp — and there "Your final build is
  // ready" is exactly right, a faithful re-send.
  //
  // Repriced is not a re-send. Staff have re-configured the build
  // (`/reconfigure`), and a second copy of the same announcement carrying a
  // different total would leave the customer with two identical subjects, two
  // numbers and no way to tell which is current. That gets its own template,
  // which names the change and what it does to their card.
  //
  // A Result still awaiting the customer's finish is never "repriced": its
  // price is a floor, not a total, until they choose cover, case and shipping
  // (ADR 0017), so it keeps the "choose your finish" voice whatever moved.
  const needsFinish = needsCustomerFinish(row);
  const rendered =
    repriced === "updated" && !needsFinish
      ? renderResultUpdatedEmail({ ...spec, previousTotal: storedFinal }, await loadEmailCopy(RESULT_EMAIL_COPY.updated))
      : renderResultAssignedEmail({ ...spec, needsFinish }, await loadEmailCopy(RESULT_EMAIL_COPY.assigned));

  let emailStatus: "sent" | "failed" | "skipped" = "skipped";
  if (row.customer_email) {
    try {
      await getEmailTransport().send({
        to: row.customer_email,
        from: getDefaultFromAddress(),
        ...rendered,
      });
      emailStatus = "sent";
    } catch (e) {
      console.error("Result payment request email failed", e);
      emailStatus = "failed";
    }
  }

  return NextResponse.json({
    ok: true,
    emailStatus,
    statusUrl: link,
    repriced,
    /** Which template went out, so the Admin Panel can say so honestly. */
    emailTemplate: repriced === "updated" && !needsFinish ? "updated" : "assigned",
    finalAmount: build.pricing.total,
    currency: row.currency ?? "SGD",
  });
}
