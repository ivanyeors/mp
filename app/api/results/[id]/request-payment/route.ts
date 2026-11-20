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
      `${ASSIGNED_BUILD_COLUMNS}, status, source, authorized_amount, payment_intent_id, final_amount, customer_email, access_token, order_id, coupon_code`,
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
      authorized: row.authorized_amount != null && row.payment_intent_id ? Number(row.authorized_amount) : null,
    },
  };

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
    emailTemplate: repriced === "updated" && !needsFinish ? "updated" : "assigned",
    finalAmount: build.pricing.total,
    currency: row.currency ?? "SGD",
  });
}
