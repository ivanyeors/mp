import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getSiteOrigin } from "@/lib/site-url";
import { easyshipConfig } from "@/lib/shipping/easyship";
import { readSenderAddress } from "@/lib/easyship/store";
import { missingOriginFields, parseShippingSettings, ShippingSettingsSchema } from "@/lib/shipping/settings";
import type { ShippingSettings } from "@/lib/shipping/types";

export const runtime = "nodejs";

export type ShippingSettingsResponse = {
  ok: true;
  settings: ShippingSettings;
  easyship: {
    /** EASYSHIP_API_TOKEN is set. The token itself never leaves the server. */
    tokenConfigured: boolean;
    environment: "sandbox" | "production" | null;
    webhookSecretConfigured: boolean;
    webhookUrl: string;
    /** A default sender address exists on Couriers › Addresses. */
    hasSender: boolean;
    missingOrigin: string[];
  };
};

async function respond(settings: ShippingSettings) {
  const config = easyshipConfig();
  const sender = await readSenderAddress();
  const body: ShippingSettingsResponse = {
    ok: true,
    settings,
    easyship: {
      tokenConfigured: config !== null,
      environment: config?.environment ?? null,
      webhookSecretConfigured: Boolean(process.env.EASYSHIP_WEBHOOK_SECRET?.trim()),
      webhookUrl: `${getSiteOrigin()}/api/shipping/easyship/webhook`,
      hasSender: sender !== null,
      missingOrigin: sender ? missingOriginFields(sender) : [],
    },
  };
  return NextResponse.json(body);
}

/** Read uncached: Staff editing the settings must see the row, not a five-minute-old copy. */
export async function GET() {
  const denied = await requireAdmin("shipping");
  if (denied) return denied;

  const { data, error } = await supabaseAdmin()
    .from("shipping_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return respond(parseShippingSettings(data as Record<string, unknown> | null));
}

export async function PUT(req: Request) {
  const denied = await requireAdmin("shipping");
  if (denied) return denied;

  const parsed = ShippingSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("shipping_settings")
    .upsert({ id: true, ...parsed.data })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateTag("shipping-settings");
  return respond(parseShippingSettings(data as Record<string, unknown>));
}
