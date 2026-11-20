import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { findCustomerByEmail } from "@/lib/ecommerce/customers";
import { getCurrentCustomerId } from "@/lib/shop/customer-addresses";
import { isPartnerCustomer, readPointsBalance, readPointsSettings } from "@/lib/points/server";
import { mayUseAccountValue, pointsAllowance } from "@/lib/points/spend";

export const runtime = "nodejs";

const AllowanceSchema = z.object({
  products_after_coupon: z.number().nonnegative(),
  email: z.string().trim().optional(),
});

const NOT_USABLE = { ok: true, usable: false } as const;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = AllowanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const sessionCustomerId = await getCurrentCustomerId();
  if (!sessionCustomerId) return NextResponse.json(NOT_USABLE);

  const admin = supabaseAdmin();
  try {
    const settings = await readPointsSettings(admin);
    if (!settings.enabled) return NextResponse.json(NOT_USABLE);
    if (await isPartnerCustomer(admin, sessionCustomerId)) return NextResponse.json(NOT_USABLE);

    const balance = await readPointsBalance(admin, sessionCustomerId);
    if (balance.available < settings.minRedeem) return NextResponse.json(NOT_USABLE);

    const email = parsed.data.email?.toLowerCase();
    const emailOk = email
      ? mayUseAccountValue(sessionCustomerId, {
          sessionCustomerId,
          emailCustomerId: (await findCustomerByEmail(email))?.id ?? null,
        })
      : null;

    return NextResponse.json({
      ok: true,
      usable: true,
      available: balance.available,
      min: settings.minRedeem,
      max: pointsAllowance({
        available: balance.available,
        productsAfterCoupon: parsed.data.products_after_coupon,
        minRedeem: settings.minRedeem,
        maxShare: settings.maxShare,
      }),
      email_ok: emailOk,
    });
  } catch (e) {
    console.error("[points/allowance]", e instanceof Error ? e.message : e);
    return NextResponse.json(NOT_USABLE);
  }
}
