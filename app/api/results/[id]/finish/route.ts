import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireResultAccess } from "@/lib/results/access";
import { ASSIGNED_BUILD_COLUMNS, loadAssignedBuild } from "@/lib/results/assigned-build";
import { needsCustomerFinish } from "@/lib/results/needs-customer-finish";
import {
  AddonLineSchema,
  AddressSchema,
  PreferenceLineSchema,
} from "@/lib/results/finish-schemas";
import {
  isCaseInventoryCategory,
  isProtectorInventoryCategory,
  itemMatchesPreferenceRole,
} from "@/lib/shop/customization-inventory";
import { preferenceCategoryAllowed } from "@/lib/configurator/preference-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FinishSchema = z.object({
  token: z.string().uuid().nullish(),
  preferenceLines: z.array(PreferenceLineSchema).min(1),
  addonLines: z.array(AddonLineSchema).default([]),
  shippingMethodId: z.string().uuid(),
  shippingAddress: AddressSchema,
});

/**
 * The customer's finish for an Assisted customisation (ADR 0017).
 *
 * Staff have assigned the fillings; the Result is `assigned` with no cover,
 * case or shipping. This writes the customer's picks and reprices through
 * `loadAssignedBuild` — the same Costings-derived price accept charges — so
 * the stored `final_amount` is the number the Balance payment asks for.
 *
 * Money never moves here. The client calls the existing accept next, which
 * opens the Balance payment Checkout.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = FinishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const admin = supabaseAdmin();

  const { data: row, error: loadErr } = await admin
    .from("mp_config_responses")
    .select(
      `${ASSIGNED_BUILD_COLUMNS}, status, source, access_token, customer_id, customer_email, order_id`,
    )
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Owner (token or signed-in match) or Staff with `results` (not a viewer). No
  // draftOnly: this row is `assigned` by design, and needsCustomerFinish below is
  // what bounds the write.
  const access = await requireResultAccess(row, input.token ?? null, {
    staffPermissions: ["results"],
  });
  if (!access.ok) return access.response;

  // Once finished, the address is set and this closes itself. A second finish
  // would silently reprice a build the customer may already be paying for.
  if (row.status !== "assigned" || !needsCustomerFinish(row)) {
    return NextResponse.json(
      { error: "This build has already been finished" },
      { status: 409 },
    );
  }

  const productType = (row.product_type as "pillow" | "bolster" | null) ?? "pillow";
  for (const line of input.preferenceLines) {
    if (!preferenceCategoryAllowed(productType, line.category)) {
      return NextResponse.json({ error: `Invalid preference ${line.category}` }, { status: 400 });
    }
  }

  const itemIds = [
    ...new Set([
      ...input.preferenceLines.map((l) => l.item_id),
      ...input.addonLines.map((l) => l.item_id),
    ]),
  ];
  const [{ data: items }, { data: shippingRow }] = await Promise.all([
    admin.from("items").select("id, category").in("id", itemIds),
    admin
      .from("shipping_methods")
      .select("slug")
      .eq("id", input.shippingMethodId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (!shippingRow) {
    return NextResponse.json({ error: "Invalid shipping method" }, { status: 400 });
  }

  // Same category rules as the hold submit.
  const categoryById = new Map((items ?? []).map((i) => [i.id as number, String(i.category)]));
  for (const line of input.preferenceLines) {
    const cat = categoryById.get(line.item_id);
    if (!cat || !itemMatchesPreferenceRole(cat, line.category)) {
      return NextResponse.json({ error: `Invalid preference item ${line.item_id}` }, { status: 400 });
    }
  }
  for (const line of input.addonLines) {
    const cat = categoryById.get(line.item_id);
    if (!cat || cat === "filling" || isProtectorInventoryCategory(cat) || isCaseInventoryCategory(cat)) {
      return NextResponse.json({ error: `Invalid add-on item ${line.item_id}` }, { status: 400 });
    }
  }

  const finished = {
    preference_lines: input.preferenceLines.map((l) => ({
      item_id: l.item_id,
      quantity: l.quantity,
      category: l.category,
    })),
    addon_lines: input.addonLines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
    shipping_method: shippingRow.slug as string,
    shipping_address: input.shippingAddress,
  };

  const build = await loadAssignedBuild(admin, { ...row, ...finished });
  if (!build.ok) return NextResponse.json({ error: build.error }, { status: 400 });
  if (build.shortages.length > 0) {
    const detail = build.shortages
      .map((s) => `${s.name}: need ${s.needed}, have ${s.available}`)
      .join("; ");
    return NextResponse.json(
      { error: `Not enough stock for this finish: ${detail}`, shortages: build.shortages },
      { status: 409 },
    );
  }

  // Guarded on the unfinished state so two tabs cannot both write a finish.
  const { data: updated, error: updateErr } = await admin
    .from("mp_config_responses")
    .update({ ...finished, final_amount: build.pricing.total })
    .eq("id", id)
    .eq("status", "assigned")
    .is("shipping_address", null)
    .select("id");
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  if (!updated?.length) {
    return NextResponse.json(
      { error: "This build has already been finished" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    finalAmount: build.pricing.total,
    currency: row.currency ?? "SGD",
  });
}
