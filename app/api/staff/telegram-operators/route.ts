import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/admin";
import { linkProfile } from "@/lib/telegram/link-admin";
import { listTelegramLinks } from "@/lib/telegram/operators";
import { TELEGRAM_ACTIONS, type TelegramAction } from "@/lib/telegram/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  staff_profile_id: z.string().uuid(),
  actions: z.array(z.enum(TELEGRAM_ACTIONS as [TelegramAction, ...TelegramAction[]])).max(10),
});

export async function GET() {
  try {
    await requireAdminContext("users");
  } catch (res) {
    return res as NextResponse;
  }
  try {
    return NextResponse.json({ ok: true, rows: await listTelegramLinks() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load Telegram access" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("users");
  } catch (res) {
    return res as NextResponse;
  }

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const result = await linkProfile(ctx, parsed.data.staff_profile_id, [...new Set(parsed.data.actions)]);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, row: result.row, linkCode: result.linkCode }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to link profile" },
      { status: 500 },
    );
  }
}
