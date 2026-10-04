import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { createTelegramOperator, listTelegramOperators } from "@/lib/telegram/operators";
import { TELEGRAM_ROLES } from "@/lib/telegram/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Users & permissions → Telegram. Who may act on review cards in the
 * measurements Telegram group. The `users` permission, like the rest of the
 * page: a review manager speaks for the business on Google Maps.
 */

const CreateSchema = z.object({
  display_name: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
  role: z.enum(TELEGRAM_ROLES),
});

export async function GET() {
  try {
    await requireAdminContext("users");
  } catch (res) {
    return res as NextResponse;
  }
  try {
    return NextResponse.json({ ok: true, rows: await listTelegramOperators() });
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { row, linkCode } = await createTelegramOperator({
      displayName: parsed.data.display_name,
      role: parsed.data.role,
      createdBy: ctx.email,
    });
    await recordAdminAction({
      actor: ctx,
      action: "telegram_operator.create",
      entityType: "telegram_operator",
      entityId: row.id,
      after: row,
    });
    return NextResponse.json({ ok: true, row, linkCode }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add person" },
      { status: 500 },
    );
  }
}
